// 上传文件名处理：TeamSpeak 服务器对非 ASCII（中文等）文件名会直接报
// "file input/output error"，所以含非 ASCII 字符的文件名在上传前自动换成 ASCII 名。
//
// 规则：
// - 纯 ASCII 文件名原样返回（不动用户已有的英文名）；
// - 含非 ASCII 时，保留其中可用的英文/数字片段，其余替换为 `-`，再追加时间戳+随机后缀防重名；
// - 扩展名只保留字母数字部分。

const NON_ASCII = /[^\x20-\x7E]/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 把可能含中文/全角字符的上传文件名换成纯 ASCII 名；纯 ASCII 名不变。 */
export function toAsciiUploadName(name: string): string {
  const raw = (name || '').trim();
  if (!raw || !NON_ASCII.test(raw)) return raw || 'file';

  const dot = raw.lastIndexOf('.');
  const baseRaw = dot > 0 ? raw.slice(0, dot) : raw;
  const extRaw = dot > 0 ? raw.slice(dot + 1) : '';

  let base =
    baseRaw
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '-')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '');
  if (!base) base = 'image';
  else if (!/[A-Za-z]/.test(base)) base = `image-${base}`;

  const ext = extRaw.replace(/[^A-Za-z0-9]/g, '');
  const now = new Date();
  const stamp =
    `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 5);

  return `${base}-${stamp}-${rand}${ext ? `.${ext}` : ''}`;
}
