/**
 * 服务器分享连接。
 *
 * 把「服务器地址/端口、服务器密码、网关口令」加密后放进 URL 的 `#join=` 片段，
 * 对方打开链接即以「匿名用户」身份自动连入，不在地址栏里明文暴露口令。
 *
 * 说明：密钥随前端一起下发，这属于「防窥/防手滑」级别的隐藏，不是强安全边界——
 * 拿到链接的人本来就被允许进服；有能力拆前端包的人仍可解出参数。
 */

const SECRET = 'huixiang-web-share-v1|9f2c7a5e4b1d8c3f';

export interface SharePayload {
  /** host */
  h: string;
  /** port */
  p: number;
  /** 服务器密码（没有则省略） */
  pw?: string;
  /** 网关访问口令（没有则省略） */
  t?: string;
  v: 1;
}

function toBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

function b64urlEncode(input: ArrayBuffer | Uint8Array): string {
  const bytes = toBytes(input);
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedKey: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = (async () => {
      const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SECRET));
      return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    })();
  }
  return cachedKey;
}

/** 加密成 URL 片段里用的不透明字符串。 */
export async function encodeShare(payload: SharePayload): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(), data);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(toBytes(ct), iv.length);
  return b64urlEncode(out);
}

/** 解出分享参数；损坏或不合法时返回 null。 */
export async function decodeShare(token: string): Promise<SharePayload | null> {
  try {
    const bytes = b64urlDecode(token);
    if (bytes.length < 13) return null;
    const iv = bytes.slice(0, 12);
    const ct = bytes.slice(12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await getKey(), ct);
    const obj: unknown = JSON.parse(new TextDecoder().decode(pt));
    if (!obj || typeof obj !== 'object') return null;
    const p = obj as Partial<SharePayload>;
    if (typeof p.h !== 'string' || !p.h || typeof p.p !== 'number' || !Number.isFinite(p.p)) return null;
    return {
      h: p.h,
      p: p.p,
      pw: typeof p.pw === 'string' ? p.pw : undefined,
      t: typeof p.t === 'string' ? p.t : undefined,
      v: 1,
    };
  } catch {
    return null;
  }
}

/** 拼成完整分享链接（当前站点 + `#join=`）。 */
export function buildShareUrl(token: string): string {
  return `${location.origin}${location.pathname}#join=${token}`;
}
