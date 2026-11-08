/**
 * 聊天附件：消息是纯文本（TS 服务器只搬文本），所以附件就藏在文本里的一个标记后面。
 *
 * 文本形如：
 *   📎 报表.pdf（1.2 MB）
 *   [[hf:%7B%22cid%22%3A1...%7D]]
 *
 * 第一行给别的客户端（TS5/TS6）一个能看懂的说法；第二行是本应用解析用的描述——文件已经传到当前频道的
 * 文件区（`/files` 那套 HTTP 端点），这里只记录 cid / 虚拟路径 / 名称 / 大小 / 类型，取字节时再用
 * 会话令牌下载。标记整体只由 JSON 的 URL 编码构成，不会出现 `]` 和换行，正则切得开。
 */
export interface ChatAttachmentInfo {
  cid: number;
  /** 频道文件区里的完整虚拟路径，如 "/m3x9k-报表.pdf"。 */
  path: string;
  name: string;
  size: number;
  kind: 'image' | 'file';
}

const TOKEN_RE = /\[\[hf:([^\]\n]+)\]\]/;

/** 把附件描述编进消息文本。 */
export function encodeAttachment(att: ChatAttachmentInfo): string {
  return `[[hf:${encodeURIComponent(JSON.stringify(att))}]]`;
}

/** 从消息文本里拆出附件描述；没有标记时 att 为 null，rest 是去掉标记后的原文。 */
export function parseAttachment(text: string): { att: ChatAttachmentInfo | null; rest: string } {
  const m = TOKEN_RE.exec(text);
  if (!m) return { att: null, rest: text };
  let att: ChatAttachmentInfo | null = null;
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1])) as Partial<ChatAttachmentInfo>;
    if (
      parsed &&
      typeof parsed.path === 'string' &&
      typeof parsed.name === 'string' &&
      typeof parsed.cid === 'number' &&
      (parsed.kind === 'image' || parsed.kind === 'file')
    ) {
      att = {
        cid: parsed.cid,
        path: parsed.path,
        name: parsed.name,
        size: typeof parsed.size === 'number' ? parsed.size : 0,
        kind: parsed.kind,
      };
    }
  } catch {
    att = null;
  }
  return { att, rest: text.replace(TOKEN_RE, '').trim() };
}
