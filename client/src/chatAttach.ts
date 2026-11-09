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

/** TeamSpeak 官方的"频道文件图片"格式，官方客户端靠它从频道文件区取图显示。 */
const PIC_RE = /\[img\]\s*ts3image:\/\/([^[\]?]+)\?([^[\]]*)\s*\[\/img\]/i;

/**
 * 把"频道文件里的图片"编成 TeamSpeak 官方能识别的 BBCode：
 *   [img]ts3image://<文件名>?channel=<频道id>&path=<目录>[/img]
 * 和本应用自己的 [[hf:]] 不同，这个格式官方客户端（以及 PocketTS 系客户端）都能直接显示成图片。
 */
export function encodeChannelPicture(name: string, cid: number, folder = '/'): string {
  const dir = folder.endsWith('/') ? folder : `${folder}/`;
  return `[img]ts3image://${name}?channel=${cid}&path=${dir}[/img]`;
}

/** 从消息里拆出官方频道图片；没有时 att 为 null，rest 是去掉 BBCode 后的原文。 */
export function parseChannelPicture(text: string): { att: ChatAttachmentInfo | null; rest: string } {
  const m = PIC_RE.exec(text);
  if (!m) return { att: null, rest: text };
  let name = m[1].trim();
  // 兼容被百分号编码过的文件名；纯中文/空格原样保留。
  if (/%[0-9a-f]{2}/i.test(name)) {
    try {
      name = decodeURIComponent(name);
    } catch {
      /* 保留原样 */
    }
  }
  const q = new URLSearchParams(m[2]);
  const cid = Number(q.get('channel'));
  const folder = q.get('path') || '/';
  if (!Number.isFinite(cid) || cid <= 0 || !name) return { att: null, rest: text };
  const path = `${folder.endsWith('/') ? folder : `${folder}/`}${name}`;
  const rest = text.replace(PIC_RE, '').trim();
  // 发送时我们把"🖼️ 原名（大小）"放在前面给人看；有它就优先用原文件名和大小展示。
  let display = name;
  let size = 0;
  const label = /(?:🖼️|📎)\s*(.+?)\s*[（(]\s*([\d.]+)\s*(B|KB|MB|GB)\s*[）)]/i.exec(rest);
  if (label) {
    display = label[1].trim() || name;
    const unit = label[3].toUpperCase();
    const mul = unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : unit === 'KB' ? 1024 : 1;
    size = Math.round(Number(label[2]) * mul);
  }
  return {
    att: { cid, path, name: display, size, kind: 'image' },
    rest,
  };
}

/** 官方客户端经 myTeamSpeak 云发来的文件描述（{"msg_type":"ts.file.myts",...}）。 */
export interface MyTsFileInfo {
  name: string;
  size: number;
  isImage: boolean;
}

/** 识别官方 myTeamSpeak 文件消息；无法预览时至少显示成文件卡片而不是原始 JSON。 */
export function parseMyTsFile(text: string): MyTsFileInfo | null {
  const t = text.trim();
  if (!t.startsWith('{') || !t.includes('"msg_type"')) return null;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    const type = typeof o.msg_type === 'string' ? o.msg_type : '';
    if (!type.startsWith('ts.file')) return null;
    const name = String(o.file_name || o.body || '附件');
    const size = typeof o.file_size === 'number' ? o.file_size : 0;
    return { name, size, isImage: /\.(jpe?g|png|gif|webp|bmp|heic|avif)$/i.test(name) };
  } catch {
    return null;
  }
}

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
