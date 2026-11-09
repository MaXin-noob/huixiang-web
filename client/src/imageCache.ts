// 聊天 / 频道文件图片的本地缓存。
//
// 这些图片走 `/files/download`（要带会话令牌），浏览器默认既不缓存响应、组件每次挂载又都会重新
// 下载一遍；往上翻聊天、切频道回来就会把同一张图反复从 TS 服务器拉一遍。这里做两级缓存：
//
//   1. 内存 LRU：当前标签页内命中直接给 Blob，零 IO；
//   2. IndexedDB：跨刷新/重开页面仍然命中，省掉服务器往返。
//
// key 里带文件大小（`cid:path:size`），同名文件被覆盖后大小变了自然换 key；再叠加 24 小时 TTL，
// 覆盖后大小恰好没变的极端情况也不会永久读到旧图。

const DB_NAME = 'huixiang-image-cache';
const DB_VERSION = 1;
const STORE = 'images';

/** 单张图片最大缓存体积，超过就不进缓存（避免一张大图吃满配额）。 */
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
/** 内存缓存上限。 */
const MEM_MAX_BYTES = 64 * 1024 * 1024;
/** IndexedDB 缓存上限。 */
const DB_MAX_BYTES = 200 * 1024 * 1024;
/** 缓存有效期：24 小时。 */
const TTL_MS = 24 * 60 * 60 * 1000;

interface CachedImage {
  key: string;
  blob: Blob;
  size: number;
  time: number;
}

/** 图片缓存的 key：同一频道同一路径 + 文件大小。 */
export function imageCacheKey(cid: number, path: string, size: number): string {
  return `${cid}:${path}:${size}`;
}

// ====== 内存 LRU ======

const mem = new Map<string, Blob>();
let memBytes = 0;

function memGet(key: string): Blob | undefined {
  const blob = mem.get(key);
  if (!blob) return undefined;
  // 命中后挪到队尾（Map 保持插入顺序，队首就是最久未用的）
  mem.delete(key);
  mem.set(key, blob);
  return blob;
}

function memPut(key: string, blob: Blob): void {
  if (blob.size > MAX_ENTRY_BYTES) return;
  const old = mem.get(key);
  if (old) {
    mem.delete(key);
    memBytes -= old.size;
  }
  mem.set(key, blob);
  memBytes += blob.size;
  while (memBytes > MEM_MAX_BYTES) {
    const first = mem.keys().next();
    if (first.done) break;
    const evicted = mem.get(first.value);
    mem.delete(first.value);
    if (evicted) memBytes -= evicted.size;
  }
}

// ====== IndexedDB ======

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('time', 'time', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function dbGet(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => {
        const rec = req.result as CachedImage | undefined;
        if (!rec || !rec.blob) {
          resolve(undefined);
          return;
        }
        if (Date.now() - rec.time > TTL_MS) {
          void dbDelete(key);
          resolve(undefined);
          return;
        }
        resolve(rec.blob);
      };
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function dbDelete(key: string): Promise<void> {
  return openDb().then((db) => {
    if (!db) return;
    try {
      db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
    } catch {
      /* 缓存失败不影响主流程 */
    }
  });
}

async function dbPut(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put({ key, blob, size: blob.size, time: Date.now() } satisfies CachedImage);
  } catch {
    /* 配额不足等：静默失败 */
  }
  void trimDb();
}

/** 把最旧的条目删到容量上限以内。 */
async function trimDb(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    const all: CachedImage[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        all.push(cursor.value as CachedImage);
        cursor.continue();
        return;
      }
      let total = all.reduce((n, r) => n + r.size, 0);
      if (total <= DB_MAX_BYTES) return;
      all.sort((a, b) => a.time - b.time);
      for (const rec of all) {
        if (total <= DB_MAX_BYTES) break;
        store.delete(rec.key);
        total -= rec.size;
      }
    };
  } catch {
    /* 清理失败忽略，下一次 put 再试 */
  }
}

// ====== 对外入口 ======

/**
 * 取一张图片的 Blob：先内存、再 IndexedDB，都没有才调用 [load] 真正下载，成功后回填两级缓存。
 * 缓存只是优化，任何缓存异常都不应当让图片显示失败。
 */
export async function getImageBlobCached(
  key: string,
  load: () => Promise<Blob>,
  maxBytes = MAX_ENTRY_BYTES,
): Promise<Blob> {
  const fromMem = memGet(key);
  if (fromMem) return fromMem;

  const fromDb = await dbGet(key);
  if (fromDb) {
    memPut(key, fromDb);
    return fromDb;
  }

  const blob = await load();
  if (blob.size <= maxBytes) {
    memPut(key, blob);
    void dbPut(key, blob);
  }
  return blob;
}
