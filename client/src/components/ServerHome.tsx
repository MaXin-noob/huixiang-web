import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import {
  Button,
  Avatar as SemiAvatar,
  AIChatDialogue,
  Checkbox,
  Dropdown,
  Input,
  InputNumber,
  Modal,
  Popover,
  Radio,
  RadioGroup,
  Select,
  SideSheet,
  Slider,
  Space,
  Switch,
  Tag,
  TextArea,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconMore,
  IconEdit,
  IconDelete,
  IconCopy,
  IconPlus,
  IconMicrophone,
  IconMicrophoneOff,
  IconVolume2,
  IconVolumnSilent,
  IconUserGroup,
  IconFolder,
  IconChevronDown,
  IconChevronUp,
  IconChevronLeft,
  IconChevronRight,
  IconLock,
  IconClose,
  IconExit,
  IconMoon,
  IconSetting,
  IconGlobe,
  IconServer,
  IconPulse,
  IconFile,
  IconShare,
  IconHistory,
} from '@douyinfe/semi-icons';
import StreamPanel from './StreamPanel';
import { initialStreamState, type StreamState } from '../stream';
import type { PingSample } from '../pingStats';
import {
  eachMember,
  emptyCloud,
  emptyContacts,
  findMember,
  flatten,
  memberKey,
  POKE_TEXT_MAX,
  type AccountState,
  type ChannelCreate,
  type ChannelKind,
  type ChannelNode,
  type ChannelPatch,
  type ChatLine,
  type CloudChat,
  type CloudState,
  type ContactsMessage,
  type FilesMessage,
  type Friend,
  type Member,
  type MicMode,
  type PersonDetails,
  type ServerEvent,
  type State,
  type WebLivePublisher,
} from '../protocol';
import { avatarColor, avatarSources, initial } from '../ui';
import { convertShortcodes, isEmojiOnly, EMOJI_LIST } from '../emoji';
import VolumePopover from './VolumePopover';
import UserCard from './UserCard';
import ChannelIcon from './ChannelIcon';
import FilesPanel from './FilesPanel';
import FriendsPanel from './FriendsPanel';
import ChatAttachment from './ChatAttachment';
import { encodeAttachment, parseAttachment, encodeChannelPicture, parseChannelPicture, parseMyTsFile, type ChatAttachmentInfo } from '../chatAttach';
import { formatBytes, uploadFile } from '../files';
import { makeChannelIconPng } from '../iconImage';
import { toAsciiUploadName } from '../uploadName';
import './server-home.css';

/** AIChatDialogue 的角色元数据：聊天记录里所有成员都按 user 角色渲染。 */
const AI_ROLE_CONFIG = {
  user: { name: '成员', color: 'grey' },
  assistant: { name: '回响', color: 'blue' },
  system: { name: '系统', color: 'grey' },
} as const;

interface Props {
  state: State;
  chat: ChatLine[];
  chatMore: boolean;
  chatBusy: boolean;
  onLoadMoreChat: () => void;
  avatarToken: string;
  account: AccountState;
  /** 上传 / 更换 myTeamSpeak 账号头像（文件选择后交给 account.ts 压图并 POST）。 */
  onAvatarChange?: (file: File) => void | Promise<void>;
  /** 删除 myTeamSpeak 账号头像。 */
  onAvatarRemove?: () => void | Promise<void>;
  /** 浏览器 ↔ 网关的 WebSocket 往返：过去 5 秒的均值 ± 标准差（ms），未知为 null。 */
  pingGateway: PingSample | null;
  /** 网关 ↔ TeamSpeak 的 UDP 往返：过去 5 秒的均值 ± 标准差（ms），未知为 null。 */
  pingServer: PingSample | null;
  micOn: boolean;
  micLevel: number;
  ownTalking: boolean;
  talkingIds: ReadonlySet<number>;
  onJoinChannel: (cid: number, password?: string) => void;
  onSay: (text: string) => void;
  /** 修改自己的服务器昵称（clientupdate client_nickname）。 */
  onRename?: (name: string) => void;
  onToggleInput: () => void;
  onToggleOutput: () => void;
  onDisconnect: () => void;
  /** 生成服务器分享连接（加密后的 URL）；返回空串表示当前没有可分享的信息。 */
  onShareLink?: () => Promise<string>;
  /** 本会话的服务器事件（进/出/切换频道）。 */
  serverEvents?: ServerEvent[];
  /** 打开「服务器事件」面板时向网关补一份历史。 */
  onRequestEvents?: () => void;
  /** 说话方式：自动（检测到人声才发）/ 常开 / 按住说话，默认自动。 */
  micMode?: MicMode;
  onMicMode?: (mode: MicMode) => void;
  /** 按住说话时是否正按着（仅 ptt 模式有意义）。 */
  pttHeld?: boolean;
  onPttHold?: (held: boolean) => void;
  /** 浏览器是否已具备语音编解码能力（WebCodecs），否则语音不可用。 */
  audioReady?: boolean;
  /** 麦克风增益（0–2），默认 1。 */
  micGain?: number;
  onMicGain?: (v: number) => void;
  /** 扬声器总音量（0–2），默认 1。 */
  outputGain?: number;
  onOutputGain?: (v: number) => void;
  /** 自己是否暂离。 */
  away?: boolean;
  awayMessage?: string;
  onToggleAway?: (away: boolean) => void;
  onSetAwayMessage?: (message: string) => void;
  /** 成员资料卡：服务器补问回来的公开字段（按 clientId 缓存）。 */
  personDetails?: Record<number, PersonDetails>;
  onPerson?: (clientId: number) => void;
  /** 戳一戳某个成员（资料卡右上角按钮）。 */
  onPoke?: (clientId: number) => void;
  /** 戳一戳时发送的自定义文案；空串则用默认的「戳了你一下」。 */
  pokeText?: string;
  onPokeText?: (v: string) => void;
  /** 成员个人音量（按 uid 记，0–2，0 = 单独静音）。 */
  volumes?: Record<string, number>;
  onMemberVolume?: (member: Member, v: number) => void;
  /** 会话文件令牌；没连上时为空串。文件字节与写操作都靠它鉴权。 */
  fileToken?: string;
  /** 最近一次收到的目录列表（由 App 的 onFiles 推来）。 */
  files?: FilesMessage | null;
  /** 向网关要某个频道、某个路径的文件列表。 */
  onListFiles?: (cid: number, path: string) => void;
  /** myTeamSpeak 好友列表（云聊天入口）。 */
  friends?: ContactsMessage;
  /** 云聊天连接状态。 */
  cloud?: CloudState;
  /** 当前打开的好友会话；没打开是 null。 */
  cloudChat?: CloudChat | null;
  /** 云聊天的一次性提示（发送失败等），可为空。 */
  cloudNotice?: string | null;
  onCloudConnect?: () => void;
  onCloudDisconnect?: () => void;
  onCloudOpen?: (friend: Friend) => void;
  onCloudSend?: (roomId: string, text: string) => void;
  onCloudHistory?: (roomId: string) => void;
  onDismissCloudNotice?: () => void;
  /** 完整的实时聊天行（含私聊），好友抽屉按人筛私聊用。 */
  allChat?: ChatLine[];
  /** 给本服务器上的某个人发私聊（官方客户端认的服务器文本消息）。 */
  onPrivately?: (clientId: number, text: string) => void;
  /** 桌面通知开关当前是否开启。 */
  notifyOn?: boolean;
  /** 浏览器是否支持桌面通知。 */
  notifySupported?: boolean;
  /** 切换桌面通知（打开时会申请浏览器权限）。 */
  onToggleNotify?: () => void;
  /** 串流状态：自己在共享什么 / 正在看谁。 */
  stream?: StreamState;
  /** 网页直播（LiveKit）里正在播的人，用来点亮成员行的「直播中」。 */
  webLive?: WebLivePublisher[];
  /** 开始共享屏幕。 */
  onShareScreen?: () => void;
  /** 用 LiveKit 发起网页直播（主播只上行一路，适合人多时）。 */
  onShareLive?: () => void;
  /** 停止自己的共享。 */
  onStopShare?: () => void;
  /** 观看某个成员的直播。 */
  onWatch?: (clientId: number) => void;
  /** 停止观看。 */
  onStopWatch?: () => void;
  /** 新建频道（网关 tsproto.ChannelEdits 已实现，权限由服务器判定）。 */
  onCreateChannel?: (patch: ChannelCreate) => void;
  /** 修改频道：只提交要改的字段。 */
  onEditChannel?: (cid: number, patch: ChannelPatch) => void;
  /** 删除频道（连同子频道，成员移到默认频道）。 */
  onDeleteChannel?: (cid: number) => void;
  /** 把成员踢出当前频道（回到默认频道）。 */
  onKickMember?: (member: Member, reason: string) => void;
  /** 把成员从服务器上踢出。 */
  onKickFromChannel?: (member: Member, reason: string) => void;
  /** 封禁成员；seconds 为 0 表示永久。 */
  onBanMember?: (member: Member, seconds: number, reason: string) => void;
  /**
   * 本期只接入 M1/M2 用到的字段；旧 ServerPage 传进来的其余字段（文件、串流、
   * 好友、云聊天、频道管理等）先照单接收，等后续里程碑逐个接上，避免一次性大改。
   */
  [key: string]: unknown;
}

/* —— 内联图标（灰阶，避免额外资源） —— */
const IcSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M20 20l-3.6-3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const IcInfo = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="7.6" r="1.05" fill="currentColor" />
  </svg>
);

const IcVoice = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 9.5v5h3l4 3V6.5l-4 3H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14.5 9.6a3.6 3.6 0 010 4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M16.8 7.4a7 7 0 010 9.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const IcMonitor = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const IcEmoji = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="9" cy="10" r="1.15" fill="currentColor" />
    <circle cx="15" cy="10" r="1.15" fill="currentColor" />
    <path d="M8.5 14a4 4 0 007 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const IcClip = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M20 11l-8.3 8.3a4.5 4.5 0 01-6.4-6.4l8-8a3 3 0 014.3 4.3l-8 8a1.5 1.5 0 01-2.1-2.1l7.3-7.3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IcImage = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="8.5" cy="9.5" r="1.4" fill="currentColor" />
    <path d="M4.5 17l4.8-4.8 3.4 3.4 2.8-2.8 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** 直播头像装饰：粉色流光边框 + 顶部「直播」渐变角标（Semi Avatar 2.52+ 能力）。 */
const LIVE_AVATAR_PROPS = {
  border: { color: '#FE2C55', motion: true },
  contentMotion: true,
  topSlot: {
    text: '直播',
    gradientStart: 'rgb(255,23,100)',
    gradientEnd: 'rgb(237,52,148)',
  },
} as const;

/** 头像：优先真实图片（账号 / 服务器 / myTeamSpeak），失败逐级回退到首字母色块。底层用 Semi Avatar。 */
function Avatar({
  id,
  name,
  avatar,
  myTeamSpeakAvatar,
  ownId,
  avatarToken,
  accountAvatar,
  size,
  live = false,
}: {
  id: number;
  name: string;
  avatar?: string;
  myTeamSpeakAvatar?: string;
  ownId: number;
  avatarToken: string;
  accountAvatar: string;
  size: number;
  /** 该用户正在直播：显示 Semi 的粉色动效边框与「直播」角标。 */
  live?: boolean;
}) {
  const sources = useMemo(
    () => avatarSources({ id, avatar, myTeamSpeakAvatar }, ownId, accountAvatar, avatarToken),
    [id, avatar, myTeamSpeakAvatar, ownId, accountAvatar, avatarToken],
  );
  const [idx, setIdx] = useState(0);
  const src = sources[idx];
  const liveProps = live ? LIVE_AVATAR_PROPS : {};
  // Semi 的 topSlot/border 样式按 size 档位（24/32/40/48…）取值；像素尺寸用 style 覆盖，
  // 但档位必须落在合法枚举里，否则角标没有宽高会缩成一个点。
  const sizeTier = size <= 24 ? 'extra-small' : 'default';
  if (src) {
    return (
      <SemiAvatar
        alt={name}
        src={src}
        size={sizeTier}
        className="sh-avatar-semi"
        style={{ width: size, height: size, flex: '0 0 auto' }}
        onError={() => setIdx((i) => i + 1)}
        {...liveProps}
      />
    );
  }
  // 注意：Semi 在存在 border/topSlot/bottomSlot 时会把 style 同时铺到外层 wrapper 和
  // 定位 div 上；若把 background 放进 style，就会在圆形头像后面多出一块方形色块。
  // 因此背景与字号改用 CSS 变量交给内层 .sh-avatar-fb 处理。
  const fallbackStyle = {
    width: size,
    height: size,
    flex: '0 0 auto',
    '--sh-avatar-bg': avatarColor(id),
    '--sh-avatar-fs': `${Math.round(size * 0.42)}px`,
  } as CSSProperties;
  return (
    <SemiAvatar
      alt={name}
      size={sizeTier}
      className="sh-avatar-semi sh-avatar-fb"
      style={fallbackStyle}
      {...liveProps}
    >
      {initial(name)}
    </SemiAvatar>
  );
}

function fmtTime(seconds: number): string {
  // 服务器给的多半是秒；兼容毫秒。
  const ms = seconds > 1e11 ? seconds : seconds * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtUptime(sec: number): string {
  const day = Math.floor(sec / 86400);
  const hour = Math.floor((sec % 86400) / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (day > 0) return `${day} 天 ${hour} 小时`;
  if (hour > 0) return `${hour} 小时 ${min} 分`;
  return `${min} 分钟`;
}

/** 频道简介常夹着 BBCode、[img]ts3image://…[/img] 和默认频道的英文尾巴；标题栏只留真正的文字。 */
function cleanChannelDescription(text: string): string {
  return text
    // 图片、链接连同包在里面的内容一起去掉
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, ' ')
    .replace(/\[url=[^\]]*\][\s\S]*?\[\/url\]/gi, ' ')
    // 其余 BBCode 标签：[b]…[/b]、[color=…]…[/color]、[size=…] 之类
    .replace(/\[\/?[a-z0-9*]+(?:=[^\]]*)?\]/gi, ' ')
    // 没被标签包住的纯图片/网址残留
    .replace(/\b(?:ts3image|ts3server|https?):\/\/\S+/gi, ' ')
    // 服务端给默认频道自动加的英文说明尾巴
    .replace(/this is the default channel\.?/gi, ' ')
    // 折叠多余空白
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ServerHome(props: Props) {
  const {
    state,
    chat,
    chatMore,
    chatBusy,
    onLoadMoreChat,
    avatarToken,
    account,
    onAvatarChange,
    onAvatarRemove,
    pingGateway,
    pingServer,
    micOn,
    ownTalking,
    talkingIds,
    onJoinChannel,
    onSay,
    onRename,
    onToggleInput,
    onToggleOutput,
    onDisconnect,
    onShareLink,
    serverEvents = [],
    onRequestEvents,
    micMode = 'auto',
    onMicMode,
    pttHeld = false,
    onPttHold,
    audioReady = false,
    micGain = 1,
    onMicGain,
    outputGain = 1,
    onOutputGain,
    away = false,
    awayMessage = '',
    onToggleAway,
    onSetAwayMessage,
    personDetails,
    onPerson,
    onPoke,
    pokeText = '',
    onPokeText,
    volumes,
    onMemberVolume,
    fileToken = '',
    files = null,
    onListFiles,
    friends = emptyContacts(),
    cloud = emptyCloud(),
    cloudChat = null,
    cloudNotice = null,
    onCloudConnect,
    onCloudDisconnect,
    onCloudOpen,
    onCloudSend,
    onCloudHistory,
    onDismissCloudNotice,
    allChat = [],
    onPrivately,
    notifyOn = false,
    notifySupported = false,
    onToggleNotify,
    stream = initialStreamState,
    webLive = [],
    onShareScreen,
    onShareLive,
    onStopShare,
    onWatch,
    onStopWatch,
    onCreateChannel,
    onEditChannel,
    onDeleteChannel,
    onKickMember,
    onKickFromChannel,
    onBanMember,
  } = props;

  const connected = state.phase === 'connected';
  const ownChannelNode = useMemo(() => findChannelSafe(state.tree, state.ownChannel), [state.tree, state.ownChannel]);
  const channelName = ownChannelNode ? ownChannelNode.display || ownChannelNode.name : '频道';
  const channelDesc = ownChannelNode ? cleanChannelDescription(ownChannelNode.description ?? '') : '';
  // 当前频道里正在直播的人（原生 P2P 或网页直播），用于频道头显示多人同时直播
  const liveInChannel = (ownChannelNode?.clients ?? []).filter(
    (m) => m.streaming || webLive.some((p) => p.from === m.id),
  );

  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [awayMsgDraft, setAwayMsgDraft] = useState('');
  /** TeamSpeak 昵称上限 30 个字符。 */
  const NICKNAME_MAX = 30;
  // 设置页里的账号头像：隐藏的文件选择框、上传/删除进行中的标志（防重复点击）。
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [pwChannel, setPwChannel] = useState<ChannelNode | null>(null);
  const [pwValue, setPwValue] = useState('');
  // 频道管理：新建/编辑表单、删除确认、行内「更多」菜单。
  const [chanDialog, setChanDialog] = useState<{ mode: 'create' | 'edit'; target: ChannelNode | null } | null>(null);
  const [chanIconBusy, setChanIconBusy] = useState(false);
  const chanIconInput = useRef<HTMLInputElement | null>(null);
  const [chanForm, setChanForm] = useState<ChanForm>(() => defaultChanForm());
  const [deleteTarget, setDeleteTarget] = useState<ChannelNode | null>(null);
  const [chanMenuId, setChanMenuId] = useState<number | null>(null);
  const [memMenuId, setMemMenuId] = useState<number | null>(null);
  // 成员管理：踢出频道 / 踢出服务器 / 封禁（弹窗里填原因、选封禁时长）。
  const [modTarget, setModTarget] = useState<{ member: Member; kind: 'channel' | 'server' | 'ban' } | null>(null);
  const [modReason, setModReason] = useState('');
  const [banSeconds, setBanSeconds] = useState(600);
  const [filesOpen, setFilesOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachBusy, setAttachBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** 移动端：频道页 / 聊天页。桌面端由 CSS 忽略，不影响双栏布局。 */
  const [mobilePane, setMobilePane] = useState<'channels' | 'chat'>('channels');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dlgRef = useRef<AIChatDialogue | null>(null);

  /** 在光标处插入一个 emoji，并把焦点/光标落回原位置之后。 */
  const insertEmoji = (ch: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + ch + draft.slice(end);
    setDraft(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      const pos = start + ch.length;
      node.setSelectionRange(pos, pos);
    });
  };

  // 聊天记录 → AIChatDialogue 消息；id 同时用于反查原始 ChatLine（头像/昵称/时间/直播态）。
  const aiChats = useMemo(
    () =>
      chat.map((line, i) => ({
        id: `${line.time}-${line.from}-${i}`,
        role: 'user',
        name: line.name,
        content: convertShortcodes(line.text),
        createdAt: line.time * 1000,
      })),
    [chat],
  );
  const aiLineById = useMemo(() => {
    const m = new Map<string, ChatLine>();
    chat.forEach((line, i) => m.set(`${line.time}-${line.from}-${i}`, line));
    return m;
  }, [chat]);

  // 一次性摊平整棵树：既保留父→子顺序，又方便过滤。
  const flat = useMemo(() => flatten(state.tree), [state.tree]);

  // 同一父频道下的频道（按显示顺序）；频道排序的上移/下移据此判断相邻项。
  const siblingChannels = useMemo(() => {
    const m = new Map<number, ChannelNode[]>();
    for (const { channel } of flat) {
      const arr = m.get(channel.parent);
      if (arr) arr.push(channel);
      else m.set(channel.parent, [channel]);
    }
    return m;
  }, [flat]);

  // 好友是否正连在这台服务器上：uid → clientId；昵称兜底（好友的 identifier 就是 TS 身份 UID）
  const onlineUids = useMemo(() => {
    const m = new Map<string, number>();
    eachMember(state.tree, (c) => {
      if (c.uid) m.set(c.uid, c.id);
    });
    return m;
  }, [state.tree]);
  const onlineByName = useMemo(() => {
    const m = new Map<string, number>();
    eachMember(state.tree, (c) => {
      if (c.nickname) m.set(c.nickname, c.id);
    });
    return m;
  }, [state.tree]);
  const memberById = useMemo(() => {
    const m = new Map<number, Member>();
    eachMember(state.tree, (c) => m.set(c.id, c));
    return m;
  }, [state.tree]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return flat;
    return flat.filter(
      (row) =>
        (row.channel.display || row.channel.name).toLowerCase().includes(q) ||
        row.channel.clients.some((m) => m.nickname.toLowerCase().includes(q)),
    );
  }, [flat, q]);

  // 新消息自动滚到底。AIChatDialogue 会在内容完成二次布局之前就滚动：
  // 最后一条消息的标题行、气泡高度稍后才补上，导致底部露出一截、被输入框挡住，
  // 必须手动滚一下才能看全。这里在挂载/新消息后先强制贴底，再在随后的几帧、
  // 短延时以及滚动容器/内容尺寸变化时继续补滚，等异步布局稳定后仍精确贴底。
  useEffect(() => {
    const scroller = () => dlgRef.current?.containerRef.current ?? listRef.current ?? null;
    // force=false 时只在用户原本就贴着底部（<48px）时才跟随，避免用户手动往回翻时被拽回底部。
    const pin = (force: boolean) => {
      const el = scroller();
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      if (force || nearBottom) el.scrollTop = el.scrollHeight;
    };
    pin(true);
    const timers = [0, 30, 80, 160, 320, 600].map((d) => window.setTimeout(() => pin(true), d));
    // 用 rAF 连续贴底约 400ms，覆盖 Semi 内部二次布局与图片异步撑高的时序。
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      pin(true);
      if (performance.now() - start < 400) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    // 内容高度晚到时（图片加载完、字体替换）若仍贴底就继续跟随。
    let ro: ResizeObserver | undefined;
    const el = scroller();
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => pin(false));
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (raf) window.cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [chat.length]);

  // AIChatDialogue 的列表滚动到顶部时继续加载更早的消息
  useEffect(() => {
    const el = dlgRef.current?.containerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop < 40 && chatMore && !chatBusy) onLoadMoreChat();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [chat.length, chatMore, chatBusy, onLoadMoreChat]);

  // 按住说话：仅在 ptt 模式下监听空格键。输入框里打空格要正常输入，故跳过可编辑元素。
  useEffect(() => {
    if (micMode !== 'ptt') return;
    const editable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || editable(e.target)) return;
      e.preventDefault();
      onPttHold?.(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || editable(e.target)) return;
      onPttHold?.(false);
    };
    const release = () => onPttHold?.(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      onPttHold?.(false);
    };
  }, [micMode, onPttHold]);

  const toggleCollapse = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tryJoin = (ch: ChannelNode) => {
    if (ch.spacer) return;
    if (ch.id === state.ownChannel) {
      setMobilePane('chat');
      return;
    }
    if (ch.password) {
      setPwValue('');
      setPwChannel(ch);
      return;
    }
    onJoinChannel(ch.id);
    setMobilePane('chat');
  };

  const submitPassword = () => {
    if (!pwChannel) return;
    onJoinChannel(pwChannel.id, pwValue);
    setPwChannel(null);
    setPwValue('');
    setMobilePane('chat');
  };

  // —— 频道管理：新建 / 编辑 / 删除 ——
  const openCreateChannel = (parent = 0) => {
    setChanForm({ ...defaultChanForm(), parent });
    setChanDialog({ mode: 'create', target: null });
  };

  const openEditChannel = (ch: ChannelNode) => {
    setChanForm({
      name: ch.display || ch.name,
      description: ch.description ?? '',
      parent: ch.parent,
      kind: ch.kind ?? 'permanent',
      password: ch.password,
      newPassword: '',
      codec: ch.codec ?? 4,
      quality: ch.quality ?? 6,
      maxClients: ch.maxClients ?? -1,
      iconId: ch.iconId ?? 0,
    });
    setChanDialog({ mode: 'edit', target: ch });
  };

  const pickChanIcon = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      Toast.warning('请选择图片文件');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      Toast.warning('图片太大，请选 20 MB 以内的图片');
      return;
    }
    if (!fileToken) {
      Toast.error('文件传输还没准备好，请稍后再试');
      return;
    }
    setChanIconBusy(true);
    try {
      const blob = await makeChannelIconPng(file);
      // 图标 id 由客户端给出，取 1000 以上的随机值，指向服务器文件 /icon_<id>。
      // 控制在 2^31 以内，避免超出 TS 的 int 范围导致权限值/图标 id 出错。
      const id = 1000 + Math.floor(Math.random() * 2_000_000_000);
      const path = `/icon_${id}`;
      const named = new File([blob], `icon_${id}.png`, { type: 'image/png' });
      await uploadFile({ token: fileToken, cid: 0, path, file: named, overwrite: true });
      setChanForm((f) => ({ ...f, iconId: id }));
      Toast.success('频道头像已上传，保存后生效');
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : '频道头像上传失败');
    } finally {
      setChanIconBusy(false);
    }
  };

  const submitChannel = () => {
    const name = chanForm.name.trim();
    if (!name) {
      Toast.warning('请填写频道名称');
      return;
    }
    const target = chanDialog?.target ?? null;
    // 已经设了密码的频道，编辑时留空表示不改，不算错；新建或由无到有必须给密码。
    if (chanForm.password && !target?.password && !chanForm.newPassword.trim()) {
      Toast.warning('请填写频道密码，或取消勾选「有密码」');
      return;
    }
    if (chanDialog?.mode === 'create') {
      onCreateChannel?.({
        name,
        description: chanForm.description.trim() || undefined,
        kind: chanForm.kind,
        password: chanForm.password,
        newPassword: chanForm.password ? chanForm.newPassword : '',
        codec: chanForm.codec,
        quality: chanForm.quality,
        maxClients: chanForm.maxClients,
        parent: chanForm.parent,
        after: 0,
      });
      setChanDialog(null);
      return;
    }
    if (!target) return;
    const patch: ChannelPatch = {};
    if (name !== (target.display || target.name)) patch.name = name;
    if (chanForm.description !== (target.description ?? '')) patch.description = chanForm.description.trim();
    if (chanForm.kind !== (target.kind ?? 'permanent')) patch.kind = chanForm.kind;
    if (chanForm.password !== target.password) patch.password = chanForm.password;
    if (chanForm.password && chanForm.newPassword.trim()) patch.newPassword = chanForm.newPassword;
    if (chanForm.codec !== target.codec) patch.codec = chanForm.codec;
    if (chanForm.quality !== (target.quality ?? 6)) patch.quality = chanForm.quality;
    if (chanForm.maxClients !== target.maxClients) patch.maxClients = chanForm.maxClients;
    if (chanForm.iconId !== (target.iconId ?? 0)) patch.iconId = chanForm.iconId;
    if (Object.keys(patch).length === 0) {
      Toast.info('频道没有改动');
      setChanDialog(null);
      return;
    }
    onEditChannel?.(target.id, patch);
    setChanDialog(null);
  };

  const confirmDeleteChannel = () => {
    if (!deleteTarget) return;
    onDeleteChannel?.(deleteTarget.id);
    setDeleteTarget(null);
  };

  // 频道排序：与相邻的同级频道交换 channel_order（服务器按 order 升序排列）。
  const moveChannel = (channel: ChannelNode, dir: -1 | 1) => {
    const sibs = siblingChannels.get(channel.parent) ?? [];
    const i = sibs.findIndex((c) => c.id === channel.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sibs.length) return;
    const other = sibs[j];
    onEditChannel?.(channel.id, { after: other.order ?? j });
    onEditChannel?.(other.id, { after: channel.order ?? i });
  };

  // 成员管理：打开弹窗（踢出频道 / 踢出服务器 / 封禁），提交时带上原因与时长。
  const openMod = (member: Member, kind: 'channel' | 'server' | 'ban') => {
    setModReason('');
    setBanSeconds(600);
    setModTarget({ member, kind });
  };
  const submitMod = () => {
    if (!modTarget) return;
    const reason = modReason.trim();
    if (modTarget.kind === 'channel') onKickFromChannel?.(modTarget.member, reason);
    else if (modTarget.kind === 'server') onKickMember?.(modTarget.member, reason);
    else onBanMember?.(modTarget.member, banSeconds, reason);
    setModTarget(null);
  };

  const send = () => {
    // 先把 `:blush:` 这类短码转成 emoji，再发送；纯空白不发送。
    const text = convertShortcodes(draft).trim();
    if (!text || !connected) return;
    onSay(text);
    setDraft('');
    setEmojiOpen(false);
  };

  /** 选文件前先挡住不能传的情况，避免用户点了没反应。 */
  const pickAttachment = (kind: 'image' | 'file') => {
    if (!connected) {
      Toast.error('还没连上服务器');
      return;
    }
    if (!fileToken) {
      Toast.error('文件功能尚未就绪，请稍后重试');
      return;
    }
    (kind === 'image' ? imageInputRef : fileInputRef).current?.click();
  };

  /**
   * 上传一个文件到当前频道的文件区，再发一条带附件标记的消息。
   * 字节走 HTTP（和文件面板同一套端点、同一个会话令牌），文本走 say，别的客户端也能看到文件名。
   */
  const sendAttachment = async (file: File, kind: 'image' | 'file') => {
    if (!connected) {
      Toast.error('还没连上服务器');
      return;
    }
    if (!fileToken) {
      Toast.error('文件功能尚未就绪，请稍后重试');
      return;
    }
    const MAX_ATTACH = 100 * 1024 * 1024;
    if (file.size > MAX_ATTACH) {
      Toast.error(`${file.name} 超过 100 MB，请换个小一点的文件`);
      return;
    }
    setAttachBusy(true);
    // 根目录下用时间戳前缀防重名；去掉路径分隔符等非法字符，免得网关拒绝。
    // 服务器不接受中文/非 ASCII 文件名（会报 file input/output error），先自动换成英文名。
    const stamp = Date.now().toString(36);
    const uploadName = toAsciiUploadName(file.name);
    const safe = uploadName.replace(/[\\/:*?"<>|]/g, '_') || 'file';
    const path = `/${stamp}-${safe}`;
    try {
      await uploadFile({ token: fileToken, cid: state.ownChannel, path, file });
      const att: ChatAttachmentInfo = {
        cid: state.ownChannel,
        path,
        name: file.name,
        size: file.size,
        kind,
      };
      // 第一行给人看；图片用 TeamSpeak 官方频道图片 BBCode（官方客户端也能直接显示），
      // 其它文件仍用本应用自己的 [[hf:]] 标记（官方看得到一行说明，但不会显示文件）。
      const label = kind === 'image' ? '🖼️' : '📎';
      const stored = path.split('/').filter(Boolean).pop() || safe;
      const body =
        kind === 'image'
          ? `${label} ${file.name}（${formatBytes(file.size)}）\n${encodeChannelPicture(stored, state.ownChannel)}`
          : `${label} ${file.name}（${formatBytes(file.size)}）\n${encodeAttachment(att)}`;
      onSay(body);
    } catch (e: unknown) {
      Toast.error(`${file.name}：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAttachBusy(false);
    }
  };

  const onAttachmentPicked = (e: ChangeEvent<HTMLInputElement>, kind: 'image' | 'file') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void sendAttachment(file, kind);
  };

  /** 好友/云聊天入口：按钮一直显示；访客点击提示需登录 myTeamSpeak 账号。 */
  const openFriends = () => {
    if (account.phase !== 'signedIn') {
      Toast.info('请使用 TeamSpeak 账号登录后使用');
      return;
    }
    setFriendsOpen((v) => !v);
  };

  const info = state.server ?? null;
  // virtualserver_clientsonline 会把 serverquery 查询客户端也算进去；
  // 页面上只统计真实用户客户端（client_type=0），避免“只有 1 人却显示 2”。
  const online = state.clientCount > 0 ? state.clientCount : (info?.clientsOnline ?? 0);
  const maxClients = info?.maxClients ?? null;
  const uptimeSec =
    info?.uptime != null && info?.receivedAt != null
      ? info.uptime + Math.max(0, Math.floor((Date.now() - info.receivedAt) / 1000))
      : null;
  const createdAt = info?.createdAt ? new Date(info.createdAt * 1000).toLocaleDateString('zh-CN') : null;
  // 延迟拆两段：浏览器↔网关（WebSocket）、网关↔服务器（UDP ping）。悬停看明细。
  // 每段都用「过去 5 秒的均值 ± 标准差」表示，对齐 TeamSpeak 官方 CONNECTION_PING / _DEVIATION。
  const fmtPing = (s: PingSample | null) =>
    s != null ? `${Math.round(s.mean)} ms ±${s.std.toFixed(1)}` : '—';
  // 两段串联：均值直接相加；标准差按两段相互独立合成（σ = √(σ₁² + σ₂²)）。
  const pingTotal =
    pingGateway != null && pingServer != null
      ? { mean: pingGateway.mean + pingServer.mean, std: Math.hypot(pingGateway.std, pingServer.std) }
      : null;
  const latencySample = pingTotal ?? pingServer ?? pingGateway;
  const latency = latencySample != null ? `延迟 ${fmtPing(latencySample)}` : '延迟 —';
  // 连接质量分档：给明细面板的状态徽标与彩色虚线分隔着色（对齐官方视觉）。
  const pingTone = (s: PingSample | null) =>
    s == null ? 'none' : s.mean < 80 ? 'good' : s.mean < 150 ? 'ok' : 'bad';
  const toneText: Record<string, string> = { good: '良好', ok: '一般', bad: '较差', none: '—' };
  const toneTag: Record<string, 'green' | 'orange' | 'red' | 'grey'> = {
    good: 'green',
    ok: 'orange',
    bad: 'red',
    none: 'grey',
  };
  const banner = info?.bannerUrl ?? null;

  const ownMember = findMember(state.tree, state.ownId);

  // 设置页打开时把当前昵称带进输入框；保存后发给网关改服务器昵称。
  const openSettings = () => {
    setNicknameDraft(ownMember?.nickname ?? state.nickname ?? '');
    setAwayMsgDraft(awayMessage);
    setSettingsOpen(true);
  };
  const saveNickname = () => {
    const name = nicknameDraft.trim();
    if (!name) return Toast.warning('昵称不能为空');
    if (name.length > NICKNAME_MAX) return Toast.warning(`昵称最多 ${NICKNAME_MAX} 个字符`);
    if (name === (ownMember?.nickname ?? state.nickname ?? '')) return;
    onRename?.(name);
    Toast.success('已提交名称修改');
  };
  const saveAwayMessage = () => {
    onSetAwayMessage?.(awayMsgDraft.trim());
    Toast.success('已保存离开消息');
  };

  // 设置页「个人资料」：点头像区的按钮触发隐藏的 file input；选中图片后交给上层压图上传。
  const pickAvatar = () => avatarFileRef.current?.click();
  const onAvatarFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 清空，允许再次选择同一张图
    if (!file) return;
    setAvatarBusy(true);
    try {
      await onAvatarChange?.(file);
    } finally {
      setAvatarBusy(false);
    }
  };
  const confirmRemoveAvatar = () => {
    Modal.confirm({
      title: '删除账号头像',
      content: '删除后将以昵称首字母显示，确定删除吗？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        setAvatarBusy(true);
        try {
          await onAvatarRemove?.();
        } finally {
          setAvatarBusy(false);
        }
      },
    });
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(state.address);
      Toast.success('地址已复制');
    } catch {
      Toast.error('复制失败');
    }
  };

  const openShare = async () => {
    if (!onShareLink) return;
    try {
      const url = await onShareLink();
      if (!url) {
        Toast.error('当前没有可分享的服务器信息');
        return;
      }
      setShareUrl(url);
      setShareOpen(true);
    } catch {
      Toast.error('生成分享连接失败');
    }
  };

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      Toast.success('分享连接已复制');
    } catch {
      Toast.error('复制失败');
    }
  };

  return (
    <div className="sh-shell" data-mobile-pane={mobilePane}>
      {/* ================= 左栏 ================= */}
      <aside className="sh-rail">
        <header className="sh-rail-head">
          <div className="sh-server-row">
            <div className="sh-server-info">
              <div className="sh-server-name" title={state.serverName}>
                {state.serverName || '未命名服务器'}
              </div>
              <div className="sh-server-addr" title={state.address}>
                {state.address}
              </div>
            </div>
            <Button className="sh-share-btn btn-semi" htmlType="button" title="分享连接" onClick={() => void openShare()}>
              <IconShare />
            </Button>
            <Button className="sh-more-btn btn-semi" htmlType="button" title="更多" onClick={() => setMoreOpen((v) => !v)}>
              <IconMore />
            </Button>
          </div>

          <div className="sh-server-status">
            {searchOpen ? (
              <Input
                className="sh-search sh-search-inline"
                value={query}
                onChange={(value) => setQuery(value)}
                onBlur={() => {
                  setSearchOpen(false);
                  setQuery('');
                }}
                placeholder="搜索频道或成员"
                autoFocus
              />
            ) : (
              <div className="sh-badges">
                <span className="sh-pill sh-pill-online">
                  <span className="sh-pill-dot" />
                  在线 {online}
                  {maxClients != null ? ` / ${maxClients}` : ''}
                </span>
                <Popover
                  trigger="hover"
                  position="bottomLeft"
                  showArrow={false}
                  style={{ padding: '12px 16px', borderRadius: 12 }}
                  content={
                    <div className="sh-lat-panel">
                      <div className="sh-lat-head">
                        <Typography.Text strong className="sh-lat-title">
                          连接状态
                        </Typography.Text>
                        <Tag size="small" type="light" color={toneTag[pingTone(latencySample)]}>
                          {toneText[pingTone(latencySample)]}
                        </Tag>
                      </div>
                      <Space vertical spacing={0} className="sh-lat-rows">
                        <div className="sh-lat-row">
                          <Typography.Text type="tertiary" size="small" className="sh-lat-key">
                            <IconGlobe size="small" className="sh-lat-ico" />
                            浏览器 ↔ 网关
                          </Typography.Text>
                          <Typography.Text strong className="sh-lat-val">
                            {fmtPing(pingGateway)}
                          </Typography.Text>
                        </div>
                        <div className="sh-lat-row">
                          <Typography.Text type="tertiary" size="small" className="sh-lat-key">
                            <IconServer size="small" className="sh-lat-ico" />
                            网关 ↔ 服务器
                          </Typography.Text>
                          <Typography.Text strong className="sh-lat-val">
                            {fmtPing(pingServer)}
                          </Typography.Text>
                        </div>
                        <div className="sh-lat-row is-total">
                          <Typography.Text type="tertiary" size="small" className="sh-lat-key">
                            <IconPulse size="small" className="sh-lat-ico" />
                            合计
                          </Typography.Text>
                          <Typography.Text strong className="sh-lat-val is-total">
                            {fmtPing(pingTotal)}
                          </Typography.Text>
                        </div>
                      </Space>
                    </div>
                  }
                >
                  <span className="sh-pill sh-pill-latency">{latency}</span>
                </Popover>
              </div>
            )}
            <Button
              className="sh-status-search btn-semi"
              htmlType="button"
              title={searchOpen ? '关闭搜索' : '搜索频道或成员'}
              onClick={() => {
                if (searchOpen) {
                  setSearchOpen(false);
                  setQuery('');
                } else {
                  setSearchOpen(true);
                }
              }}
            >
              {searchOpen ? <IconClose size="small" /> : <IcSearch />}
            </Button>
          </div>

          {banner ? (
            <img className="sh-server-banner" src={banner} alt="服务器封面" />
          ) : (
            <div className="sh-server-banner sh-server-banner-empty">
              <span>{initial(state.serverName || '回')}</span>
            </div>
          )}
        </header>

        <div className="sh-rail-body">
          <div className="sh-section">
            <span>语音频道</span>
            <Button
              className="sh-sec-plus btn-semi"
              htmlType="button"
              title="新建频道"
              onClick={() => openCreateChannel()}
            >
              <IconPlus size="small" />
            </Button>
          </div>

          {visible.length === 0 && <div className="sh-empty">没有匹配的频道</div>}

          {visible.map(({ channel }) => {
            if (channel.spacer) {
              return (
                <div className="sh-spacer-row" key={channel.id}>
                  {channel.name}
                </div>
              );
            }
            const selected = channel.id === state.ownChannel;
            const hasClients = channel.clients.length > 0;
            const isCollapsed = collapsed.has(channel.id);
            const members = q
              ? channel.clients.filter((m) => m.nickname.toLowerCase().includes(q))
              : channel.clients;
            const sibs = siblingChannels.get(channel.parent) ?? [];
            const chanPos = sibs.findIndex((c) => c.id === channel.id);
            const canMoveUp = chanPos > 0;
            const canMoveDown = chanPos >= 0 && chanPos < sibs.length - 1;
            const liveMembers = channel.clients.filter(
              (m) => m.streaming || webLive.some((p) => p.from === m.id),
            );
            return (
              <div key={channel.id}>
                <Button
                  className={`sh-chan${selected ? ' selected' : ''} btn-semi`}
                  htmlType="button"
                  title={selected ? '当前所在频道' : '双击进入频道'}
                  onDoubleClick={() => tryJoin(channel)}
                  onClick={() => {
                    if (window.matchMedia('(max-width: 767px)').matches) tryJoin(channel);
                  }}
                >
                  <span
                    className={`sh-chan-chevron${hasClients ? '' : ' empty'}`}
                    onClick={(e) => {
                      if (!hasClients) return;
                      e.stopPropagation();
                      toggleCollapse(channel.id);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    {hasClients && (isCollapsed ? <IconChevronRight size="small" /> : <IconChevronDown size="small" />)}
                  </span>
                  <span className="sh-chan-icon">
                    {channel.iconId && channel.iconId > 0 ? (
                      <ChannelIcon iconId={channel.iconId} token={state.avatarToken ?? ''} />
                    ) : (
                      <IcVoice />
                    )}
                  </span>
                  <span className="sh-chan-name">{channel.display || channel.name}</span>
                  {channel.password && (
                    <span className="sh-chan-lock">
                      <IconLock size="small" />
                    </span>
                  )}
                  {liveMembers.length > 0 && (
                    <span className="sh-chan-live">
                      <span className="sh-live-dot" />
                      {liveMembers.length > 1 ? `${liveMembers.length} 人直播` : '直播中'}
                    </span>
                  )}
                  <Dropdown
                    trigger="click"
                    position="bottomRight"
                    spacing={6}
                    stopPropagation
                    visible={chanMenuId === channel.id}
                    onVisibleChange={(v) => setChanMenuId(v ? channel.id : null)}
                    render={
                      <Dropdown.Menu className="sh-chan-dd">
                        <Dropdown.Item icon={<IconPlus />} onClick={() => { setChanMenuId(null); openCreateChannel(channel.id); }}>
                          <span className="sh-dd-label">新建子频道</span>
                        </Dropdown.Item>
                        <Dropdown.Item icon={<IconEdit />} onClick={() => { setChanMenuId(null); openEditChannel(channel); }}>
                          <span className="sh-dd-label">编辑频道</span>
                        </Dropdown.Item>
                        <Dropdown.Item icon={<IconChevronUp />} disabled={!canMoveUp} onClick={() => { setChanMenuId(null); moveChannel(channel, -1); }}>
                          <span className="sh-dd-label">上移</span>
                        </Dropdown.Item>
                        <Dropdown.Item icon={<IconChevronDown />} disabled={!canMoveDown} onClick={() => { setChanMenuId(null); moveChannel(channel, 1); }}>
                          <span className="sh-dd-label">下移</span>
                        </Dropdown.Item>
                        <Dropdown.Divider />
                        <Dropdown.Item
                          icon={<IconCopy />}
                          onClick={() => {
                            setChanMenuId(null);
                            void navigator.clipboard
                              ?.writeText(String(channel.id))
                              .then(() => Toast.success('已复制频道 ID'))
                              .catch(() => Toast.error('复制失败'));
                          }}
                        >
                          <span className="sh-dd-label">复制频道 ID</span>
                        </Dropdown.Item>
                        <Dropdown.Divider />
                        <Dropdown.Item type="danger" icon={<IconDelete />} onClick={() => { setChanMenuId(null); setDeleteTarget(channel); }}>
                          <span className="sh-dd-label">删除频道</span>
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    }
                  >
                    <span
                      className="sh-chan-more"
                      title="频道管理"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <IconMore size="small" />
                    </span>
                  </Dropdown>
                </Button>

                {hasClients &&
                  !isCollapsed &&
                  members.map((m) => {
                    // 正在说话：别人靠网关的 talkingIds/m.talking，自己靠本地采集电平 ownTalking。
                    // 暂离（away）不算在说话，否则离开状态下说话仍会亮绿点；自己的状态以 state.away 为准。
                    const away = m.id === state.ownId ? state.away : m.away;
                    const speaking =
                      !away &&
                      (m.talking || talkingIds.has(m.id) || (m.id === state.ownId && ownTalking));
                    // 网页直播（LiveKit）不走 TS 的 streaming 字段，得单独看网关广播的名单
                    const liveHere = m.streaming || webLive.some((p) => p.from === m.id);
                    return (
                    <Popover
                      key={m.id}
                      trigger="hover"
                      position="right"
                      showArrow
                      content={
                        <UserCard
                          member={m}
                          live={liveHere}
                          channelName={channel.display || channel.name}
                          ownId={state.ownId}
                          accountAvatar={account.avatarUrl}
                          avatarToken={avatarToken}
                          details={personDetails?.[m.id]}
                          volume={volumes?.[memberKey(m)] ?? 1}
                          onVolume={(v) => onMemberVolume?.(m, v)}
                          onPoke={() => onPoke?.(m.id)}
                        />
                      }
                      onVisibleChange={(v) => {
                        if (v && !personDetails?.[m.id]) onPerson?.(m.id);
                      }}
                    >
                      <div className={`sh-member${speaking ? ' talking' : ''}${liveHere ? ' is-live' : ''}`}>
                        <Avatar
                          id={m.id}
                          name={m.nickname}
                          avatar={m.avatar}
                          myTeamSpeakAvatar={m.myTeamSpeakAvatar}
                          ownId={state.ownId}
                          avatarToken={avatarToken}
                          accountAvatar={account.avatarUrl}
                          size={22}
                        />
                        <span className="sh-member-name" title={m.nickname}>
                          {m.nickname}
                        </span>
                        {liveHere ? (
                          <Button
                            htmlType="button"
                            className="sh-member-live btn-semi"
                            onClick={(e) => {
                              e.stopPropagation();
                              onWatch?.(m.id);
                            }}
                            title="直播中，点击观看"
                          >
                            <span className="sh-live-dot" />
                            直播中
                          </Button>
                        ) : null}
                        {m.away ? (
                          <span className="sh-member-away" title={m.awayMessage || '离开'}>
                            离开
                          </span>
                        ) : null}
                        {liveHere ? (
                          // 直播中成员始终渲染一个固定宽度的绿点位（不说话时透明），
                          // 避免说话时绿点出现把「直播中」文字挤走。
                          <span className={`sh-member-dot${speaking ? '' : ' sh-member-dot-idle'}`} />
                        ) : speaking ? (
                          <span className="sh-member-dot" />
                        ) : null}
                        {m.id === state.ownId && (
                          // 自己那行没有「成员管理」按钮，补一个同宽的占位，保证说话绿点和别人对齐
                          <span className="sh-member-more sh-member-more-ghost" aria-hidden="true" />
                        )}
                        {m.id !== state.ownId && (
                          <Dropdown
                            trigger="click"
                            position="bottomRight"
                            spacing={4}
                            stopPropagation
                            visible={memMenuId === m.id}
                            onVisibleChange={(v) => setMemMenuId(v ? m.id : null)}
                            render={
                              <Dropdown.Menu className="sh-chan-dd">
                                <Dropdown.Item onClick={() => { setMemMenuId(null); openMod(m, 'channel'); }}>
                                  <span className="sh-dd-label">踢出频道</span>
                                </Dropdown.Item>
                                <Dropdown.Item onClick={() => { setMemMenuId(null); openMod(m, 'server'); }}>
                                  <span className="sh-dd-label">踢出服务器</span>
                                </Dropdown.Item>
                                <Dropdown.Divider />
                                <Dropdown.Item type="danger" onClick={() => { setMemMenuId(null); openMod(m, 'ban'); }}>
                                  <span className="sh-dd-label">封禁…</span>
                                </Dropdown.Item>
                              </Dropdown.Menu>
                            }
                          >
                            <span className="sh-member-more" title="成员管理" onClick={(e) => e.stopPropagation()}>
                              <IconMore size="small" />
                            </span>
                          </Dropdown>
                        )}
                      </div>
                    </Popover>
                    );
                  })}
              </div>
            );
          })}

          <div className="sh-spacer" />

          <div className="sh-tip">
            <IcInfo />
            <span className="sh-tip-desktop">双击频道即可进入</span>
            <span className="sh-tip-mobile">点击频道即可进入</span>
          </div>
        </div>

        <footer className="sh-me">
          <Avatar
            id={state.ownId}
            name={ownMember?.nickname ?? state.nickname}
            avatar={ownMember?.avatar}
            myTeamSpeakAvatar={ownMember?.myTeamSpeakAvatar}
            ownId={state.ownId}
            avatarToken={avatarToken}
            accountAvatar={account.avatarUrl}
            size={38}
            live={stream.sharing !== null}
          />
          <div className="sh-me-info">
            <div className="sh-me-name">{ownMember?.nickname ?? state.nickname}</div>
            <div className="sh-me-status">
              <span className={`sh-me-dot${state.away ? ' away' : ''}`} />
              {state.away ? '离开中' : micOn && micGain > 0 ? '在线 · 麦克风开启' : '在线 · 麦克风关闭'}
            </div>
          </div>
          <div className="sh-me-actions">
            {micMode === 'ptt' && (
              <Button
                className={`sh-me-btn${pttHeld ? ' on' : ''} btn-semi`}
                htmlType="button"
                title="按住说话（也可按住空格键）"
                aria-label="按住说话"
                aria-pressed={pttHeld}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  onPttHold?.(true);
                }}
                onPointerUp={() => onPttHold?.(false)}
                onPointerCancel={() => onPttHold?.(false)}
                onPointerLeave={() => onPttHold?.(false)}
              >
                <IconMicrophone size="small" />
              </Button>
            )}
            <VolumePopover
              title="麦克风音量"
              value={micGain}
              onChange={(v) => onMicGain?.(v)}
              trigger="hover"
            >
              <Button
                className={`sh-me-btn${micOn && micGain > 0 ? ' on' : ''} btn-semi`}
                htmlType="button"
                title={micOn && micGain > 0 ? '点击闭麦（悬停调音量）' : '点击开麦（悬停调音量）'}
                aria-label={micOn && micGain > 0 ? '闭麦' : '开麦'}
                aria-pressed={micOn && micGain > 0}
                onClick={() => {
                  if (!micOn) {
                    void onToggleInput();
                  } else if (micGain === 0) {
                    onMicGain?.(1);
                  } else {
                    void onToggleInput();
                  }
                }}
              >
                {micOn && micGain > 0 ? <IconMicrophone size="small" /> : <IconMicrophoneOff size="small" />}
              </Button>
            </VolumePopover>
            <VolumePopover
              title="扬声器音量"
              value={outputGain}
              onChange={(v) => onOutputGain?.(v)}
              zeroHint="为 0 时你听不到声音"
              trigger="hover"
            >
              <Button
                className={`sh-me-btn${state.outputMuted || outputGain === 0 ? '' : ' on'} btn-semi`}
                htmlType="button"
                title={
                  state.outputMuted || outputGain === 0
                    ? '点击取消静音（悬停调音量）'
                    : '点击静音（悬停调音量）'
                }
                aria-label={state.outputMuted || outputGain === 0 ? '取消静音' : '静音'}
                aria-pressed={state.outputMuted || outputGain === 0}
                onClick={() => {
                  // 音量在 0 时点击相当于「恢复音量并取消静音」；否则直接切换静音。
                  if (outputGain === 0) {
                    onOutputGain?.(1);
                    return;
                  }
                  onToggleOutput?.();
                }}
              >
                {state.outputMuted || outputGain === 0 ? (
                  <IconVolumnSilent size="small" />
                ) : (
                  <IconVolume2 size="small" />
                )}
              </Button>
            </VolumePopover>
            <div className="sh-me-away">
              <Button
                className={`sh-me-btn${away ? ' on' : ''} btn-semi`}
                htmlType="button"
                title={away ? '离开中，点击取消暂离' : '点击暂离'}
                aria-label={away ? '取消暂离' : '暂离'}
                aria-pressed={away}
                onClick={() => onToggleAway?.(!away)}
              >
                <IconMoon size="small" />
              </Button>
            </div>
          </div>
        </footer>

        <Modal
          title="分享连接"
          visible={shareOpen}
          onCancel={() => setShareOpen(false)}
          width={520}
          footer={
            <div className="sh-share-foot">
              <Button className="btn-semi" htmlType="button" onClick={() => setShareOpen(false)}>
                关闭
              </Button>
              <Button className="btn-semi" htmlType="button" theme="solid" type="primary" onClick={() => void copyShare()}>
                复制连接
              </Button>
            </div>
          }
        >
          <div className="sh-share-body">
            <p className="sh-share-tip">
              把这条连接发给别人，对方打开后会自动以「匿名用户」身份进入本服务器；地址、服务器密码和网关口令都已加密，不会明文显示。
            </p>
            <Input className="sh-share-input" value={shareUrl} readOnly onFocus={(e) => e.currentTarget.select()} />
          </div>
        </Modal>

        {moreOpen && (
          <>
            <div className="sh-more-backdrop" onClick={() => setMoreOpen(false)} />
            <div className="sh-more">
              <div className="sh-more-bar">
                <span className="sh-more-bar-title">服务器信息</span>
                <Button className="sh-more-close btn-semi" htmlType="button" onClick={() => setMoreOpen(false)} title="关闭">
                  <IconClose size="small" />
                </Button>
              </div>

              <div className="sh-more-user">
                <Avatar
                  id={state.ownId}
                  name={ownMember?.nickname ?? state.nickname}
                  ownId={state.ownId}
                  avatarToken={avatarToken}
                  accountAvatar={account.avatarUrl}
                  size={42}
                  live={stream.sharing !== null}
                />
                <div className="sh-more-user-info">
                  <div className="sh-more-user-name">{ownMember?.nickname ?? state.nickname}</div>
                  <div className="sh-more-user-email">
                    {account.phase === 'signedIn' && account.email ? account.email : '游客身份'}
                  </div>
                </div>
              </div>

              <div className="sh-more-rows">
                <div className="sh-more-line">
                  <span className="sh-more-k">用户</span>
                  <span className="sh-more-v">
                    {online}
                    {maxClients != null ? ` / ${maxClients}` : ''}
                  </span>
                </div>
                <div className="sh-more-line">
                  <span className="sh-more-k">频道</span>
                  <span className="sh-more-v">{info?.channelsOnline ?? '—'}</span>
                </div>
                <div className="sh-more-line">
                  <span className="sh-more-k">运行时间</span>
                  <span className="sh-more-v">{uptimeSec != null ? fmtUptime(uptimeSec) : '—'}</span>
                </div>
                <div className="sh-more-line">
                  <span className="sh-more-k">创建于</span>
                  <span className="sh-more-v">{createdAt ?? '—'}</span>
                </div>
                <div className="sh-more-line">
                  <span className="sh-more-k">地址</span>
                  <span className="sh-more-v sh-more-addr-v" title={state.address}>
                    {state.address}
                  </span>
                  <Button className="sh-copy btn-semi" htmlType="button" onClick={() => void copyAddress()}>
                    复制
                  </Button>
                </div>
              </div>

              <div className="sh-more-ver">
                <span className="sh-more-ver-prompt">&gt;_</span>
                <span className="sh-more-ver-text">
                  {[info?.platform, (info?.version ?? '').replace(/\s*\[Build:[^\]]*\]\s*/, '')]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
              </div>

              <Button
                className="sh-leave btn-semi"
                htmlType="button"
                onClick={() => {
                  setMoreOpen(false);
                  onDisconnect();
                }}
              >
                <IconExit size="small" />
                <span>离开</span>
              </Button>
            </div>
          </>
        )}
      </aside>

      <SideSheet
        title="服务器事件"
        visible={eventsOpen}
        onCancel={() => setEventsOpen(false)}
        width={380}
        placement="right"
        className="files-sheet"
      >
        <div className="files-body sh-events">
          {serverEvents.length === 0 ? (
            <div className="sh-events-empty">还没有事件。有人进入服务器、离开或切换频道时会显示在这里。</div>
          ) : (
            [...serverEvents].reverse().map((e, i) => {
              const leaveLabel: Record<number, string> = { 3: '连接丢失', 5: '被踢出', 6: '被封禁', 8: 'leaving' };
              let text: string;
              if (e.ev === 'enter') text = `已连接到 ${e.channel || '服务器'}`;
              else if (e.ev === 'move') text = `已切换到 ${e.to || '频道'}`;
              else {
                const r = e.reason != null ? leaveLabel[e.reason] : '';
                text = `已断开连接${r ? ` (${r})` : ''}`;
              }
              return (
                <div className={`sh-ev-row is-${e.ev}`} key={`${e.time}-${i}`}>
                  <span className="sh-ev-bar" />
                  <span className="sh-ev-text">
                    <b>{e.name}</b> {text}
                  </span>
                  <span className="sh-ev-time">
                    {new Date(e.time).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </SideSheet>

      <SideSheet
        title="设置"
        visible={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        width={430}
        placement="right"
        className="files-sheet"
      >
        <div className="files-body sh-settings">
          <div className="files-sub">个人资料</div>
          <div className="sh-set-row">
            <div className="sh-set-row-text">
              <div className="sh-set-label">昵称</div>
              <div className="sh-set-desc">修改后在服务器和所有客户端（含官方客户端）都会同步显示。</div>
            </div>
          </div>
          <div className="sh-nick-row">
            <Input
              value={nicknameDraft}
              onChange={(v) => setNicknameDraft(v)}
              placeholder="输入新的昵称"
              maxLength={NICKNAME_MAX}
              showClear
              aria-label="昵称"
              onEnterPress={saveNickname}
            />
            <Button
              theme="solid"
              type="primary"
              disabled={
                !nicknameDraft.trim() ||
                nicknameDraft.trim() === (ownMember?.nickname ?? state.nickname ?? '')
              }
              onClick={saveNickname}
            >
              保存
            </Button>
          </div>
          <div className="sh-avatar-row">
            <Avatar
              id={state.ownId}
              name={ownMember?.nickname || state.nickname || account.username || '我'}
              ownId={state.ownId}
              avatarToken={avatarToken}
              accountAvatar={account.avatarUrl}
              size={64}
            />
            <div className="sh-avatar-info">
              <div className="sh-set-label">
                {account.phase === 'signedIn' ? account.username || state.nickname : state.nickname || '游客'}
              </div>
              <div className="sh-set-desc">
                {account.phase === 'signedIn'
                  ? account.email || '设置一张头像，服务器与其他客户端都能看到。'
                  : '游客身份没有账号头像，登录 myTeamSpeak 后即可上传。'}
              </div>
              {account.phase === 'signedIn' && (
                <div className="sh-avatar-actions">
                  <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={onAvatarFile} />
                  <Button size="small" disabled={avatarBusy} onClick={pickAvatar}>
                    {account.avatarUrl ? '更换头像' : '上传头像'}
                  </Button>
                  {account.avatarUrl && (
                    <Button size="small" type="danger" disabled={avatarBusy} onClick={confirmRemoveAvatar}>
                      删除头像
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
          {account.phase !== 'signedIn' && (
            <div className="sh-set-hint">提示：头像属于 myTeamSpeak 账号，先在连接页登录后再来设置。</div>
          )}

          <div className="files-sub">离开消息</div>
          <div className="sh-set-row">
            <div className="sh-set-row-text">
              <div className="sh-set-label">离开消息</div>
              <div className="sh-set-desc">
                暂离后别人把鼠标悬停在你的名字上时会看到这条留言；留空则不显示。
              </div>
            </div>
          </div>
          <div className="sh-nick-row">
            <Input
              value={awayMsgDraft}
              onChange={(v) => setAwayMsgDraft(v)}
              placeholder="例如：吃饭去了，一会儿回来"
              maxLength={120}
              showClear
              aria-label="离开消息"
              onEnterPress={saveAwayMessage}
            />
            <Button
              theme="solid"
              type="primary"
              disabled={awayMsgDraft.trim() === awayMessage.trim()}
              onClick={saveAwayMessage}
            >
              保存
            </Button>
          </div>

          <div className="files-sub">通知</div>
          <div className="sh-set-row">
            <div className="sh-set-row-text">
              <div className="sh-set-label">桌面通知</div>
              <div className="sh-set-desc">收到私聊或不在当前频道的新消息时，弹出系统通知。</div>
            </div>
            <Switch
              checked={notifyOn}
              disabled={!notifySupported}
              onChange={() => onToggleNotify?.()}
              aria-label="桌面通知"
            />
          </div>
          {!notifySupported && (
            <div className="sh-set-hint">当前浏览器不支持桌面通知（需要 HTTPS 或 localhost 打开）。</div>
          )}

          <div className="files-sub">戳一戳</div>
          <div className="sh-set-row">
            <div className="sh-set-row-text">
              <div className="sh-set-label">戳一戳消息</div>
              <div className="sh-set-desc">
                别人被你戳时看到的内容；留空则显示默认的「戳了你一下」。
              </div>
            </div>
          </div>
          <Input
            value={pokeText}
            onChange={(v) => onPokeText?.(v)}
            placeholder="戳了你一下"
            maxLength={POKE_TEXT_MAX}
            showClear
            aria-label="戳一戳消息"
          />

          <div className="files-sub">语音</div>
          <div className="sh-set-row">
            <div className="sh-set-row-text">
              <div className="sh-set-label">说话方式</div>
              <div className="sh-set-desc">
                自动：检测到人声才发送；常开：一直发送；按住说话：按住空格键或左栏底部的麦克风按钮时才发送。
              </div>
            </div>
          </div>
          <RadioGroup
            className="sh-mode-group"
            type="button"
            value={micMode}
            aria-label="说话方式"
            onChange={(e) => onMicMode?.(e.target.value as MicMode)}
          >
            <Radio value="auto">自动</Radio>
            <Radio value="open">常开</Radio>
            <Radio value="ptt">按住说话</Radio>
          </RadioGroup>
          {micMode === 'ptt' && (
            <div className="sh-set-hint sh-ptt-hint">
              {micOn && micGain > 0
                ? '按住空格键（或左栏底部麦克风按钮）说话，松开即停止发送。'
                : '按住说话需先开启麦克风（左栏底部麦克风按钮）。'}
              {!audioReady && ' 当前浏览器不支持语音编码（需 WebCodecs）。'}
            </div>
          )}
        </div>
      </SideSheet>

      {/* ================= 右栏 ================= */}
      <main className="sh-chat">
        <header className="sh-chat-head">
          <Button
            className="sh-mobile-back btn-semi"
            htmlType="button"
            title="返回频道列表"
            aria-label="返回频道列表"
            onClick={() => setMobilePane('channels')}
          >
            <IconChevronLeft size="small" />
          </Button>
          <div className="sh-chat-title">
            <div className="sh-chat-title-row">
              <span className="sh-hash">#</span>
              <span className="sh-chat-name">{channelName}</span>
            </div>
            <div className="sh-chat-sub">
              {ownChannelNode ? ownChannelNode.clients.length : 0} 人在线
              {liveInChannel.length > 0
                ? ` · ${liveInChannel.length} 人正在直播（${liveInChannel.map((m) => m.nickname).join('、')}）`
                : ''}
              {channelDesc ? ` · ${channelDesc}` : ''}
            </div>
          </div>
          <div className="sh-chat-actions">
            <Dropdown
              trigger="click"
              position="bottomRight"
              menu={[
                { node: 'item' as const, name: '共享屏幕 - WebRTC（点对点）', onClick: () => onShareScreen?.() },
                {
                  node: 'item' as const,
                  name: '共享屏幕 - 网页直播（LiveKit）',
                  onClick: () => {
                    Modal.confirm({
                      title: '开启网页直播',
                      content: '该功能仅限浏览器用户使用，原生 TeamSpeak 客户端无法观看。是否继续？',
                      okText: '继续',
                      cancelText: '取消',
                      onOk: () => onShareLive?.(),
                    });
                  },
                },
                ...(stream.sharing !== null
                  ? [
                      {
                        node: 'item' as const,
                        name: '停止直播',
                        type: 'danger' as const,
                        onClick: () => onStopShare?.(),
                      },
                    ]
                  : []),
              ]}
            >
              <Button
                className={`sh-icon-btn${stream.sharing !== null ? ' is-live' : ''} btn-semi`}
                htmlType="button"
                title={stream.sharing !== null ? '直播中，点击管理' : '开始直播（共享屏幕）'}
                aria-pressed={stream.sharing !== null}
              >
                <IcMonitor />
              </Button>
            </Dropdown>
            <Button
              className="sh-icon-btn btn-semi"
              htmlType="button"
              title="频道文件"
              onClick={() => setFilesOpen(true)}
            >
              <IconFolder />
            </Button>
            {account.phase === 'signedIn' && (
              <Button
                className="sh-icon-btn btn-semi"
                htmlType="button"
                title="好友与云聊天"
                aria-pressed={friendsOpen}
                onClick={openFriends}
              >
                <IconUserGroup />
              </Button>
            )}
            <Button
              className="sh-icon-btn btn-semi"
              htmlType="button"
              title="服务器事件"
              aria-pressed={eventsOpen}
              onClick={() => {
                onRequestEvents?.();
                setEventsOpen((v) => !v);
              }}
            >
              <IconHistory />
            </Button>
            <Button
              className="sh-icon-btn btn-semi"
              htmlType="button"
              title="设置"
              aria-pressed={settingsOpen}
              onClick={() => (settingsOpen ? setSettingsOpen(false) : openSettings())}
            >
              <IconSetting />
            </Button>
          </div>
        </header>

        {(stream.watching > 0 || stream.sharing !== null) && (
          <StreamPanel
            stream={stream}
            streamerName={
              stream.watching > 0
                ? findMember(state.tree, stream.watching)?.nickname || `#${stream.watching}`
                : ''
            }
            ownName={state.nickname}
            onStopShare={() => onStopShare?.()}
            onStopWatch={() => onStopWatch?.()}
          />
        )}

        <div className="sh-messages sh-ai-messages">
          {chatBusy && <div className="sh-more-hint">加载更早的消息…</div>}
          {chat.length === 0 ? (
            <div className="sh-chat-empty">还没有消息，来打个招呼吧。</div>
          ) : (
            <>
              <div className="sh-day-divider">
                <span>今天</span>
              </div>
              <div className="sh-ai-fill">
                <AIChatDialogue
                  ref={dlgRef}
                  className="sh-aidialogue"
                  align="leftAlign"
                  mode="bubble"
                  chats={aiChats}
                  roleConfig={AI_ROLE_CONFIG}
                  showReset={false}
                  dialogueRenderConfig={{
                    renderDialogueAvatar: ({ message }) => {
                      const line = message ? aiLineById.get(String(message.id)) : undefined;
                      if (!line) return null;
                      return (
                        <Avatar
                          id={line.from}
                          name={line.name}
                          avatar={line.avatar}
                          myTeamSpeakAvatar={line.myTeamSpeakAvatar}
                          ownId={state.ownId}
                          avatarToken={avatarToken}
                          accountAvatar={account.avatarUrl}
                          size={40}
                          live={!!findMember(state.tree, line.from)?.streaming || webLive.some((p) => p.from === line.from)}
                        />
                      );
                    },
                    renderDialogueTitle: ({ message, defaultTitle }) => {
                      const line = message ? aiLineById.get(String(message.id)) : undefined;
                      if (!line) return defaultTitle;
                      return (
                        <div className="sh-ai-title">
                          <span className="sh-msg-name">{line.name}</span>
                          {line.mine && <span className="sh-badge-me">我</span>}
                          <span className="sh-msg-time">{fmtTime(line.time)}</span>
                        </div>
                      );
                    },
                    renderDialogueContent: ({ message, defaultContent }) => {
                      const line = message ? aiLineById.get(String(message.id)) : undefined;
                      if (!line) return defaultContent;
                      // 带附件标记的消息交给专门的组件渲染（图片给预览，文件给卡片）。
                      // ①本应用的 [[hf:]] 标记；②TeamSpeak 官方频道图片 [img]ts3image://…[/img]。
                      const hf = parseAttachment(line.text);
                      const att = hf.att ?? parseChannelPicture(line.text).att;
                      if (att) return <ChatAttachment att={att} token={fileToken} />;
                      // ③官方客户端经 myTeamSpeak 云发来的文件：至少显示成卡片，别让原始 JSON 露出来。
                      const myts = parseMyTsFile(line.text);
                      if (myts) {
                        return (
                          <div className="sh-attach-file sh-myts-file">
                            <span className="sh-attach-ico">
                              <IconFile size="large" />
                            </span>
                            <span className="sh-attach-info">
                              <span className="sh-attach-name" title={myts.name}>
                                {myts.name}
                              </span>
                              <span className="sh-attach-size">
                                {formatBytes(myts.size)} · 来自 TeamSpeak 客户端
                                {myts.isImage ? '（myTeamSpeak 云图片，暂不支持在网页预览）' : ''}
                              </span>
                            </span>
                          </div>
                        );
                      }
                      const text = convertShortcodes(line.text);
                      // 纯表情消息（1~3 个 emoji）按大号渲染，其余沿用默认（Markdown）渲染。
                      if (isEmojiOnly(text)) {
                        return <div className="sh-msg-emoji">{text.trim()}</div>;
                      }
                      return defaultContent;
                    },
                    renderDialogueAction: () => null,
                  }}
                />
              </div>
            </>
          )}
        </div>

        <div className="sh-composer">
          {emojiOpen && (
            <>
              <div className="sh-emoji-backdrop" onClick={() => setEmojiOpen(false)} />
              <div className="sh-emoji-picker" role="dialog" aria-label="选择表情">
                {EMOJI_LIST.map((e) => (
                  <Button
                    key={e.name}
                    htmlType="button"
                    className="sh-emoji-item btn-semi"
                    title={`:${e.name}:`}
                    aria-label={e.name}
                    onClick={() => insertEmoji(e.char)}
                  >
                    {e.char}
                  </Button>
                ))}
              </div>
            </>
          )}
          <div className="sh-composer-box">
            <TextArea
              ref={inputRef}
              className="sh-composer-input"
              value={draft}
              borderless
              onChange={(value) => setDraft(value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={connected ? `给 #${channelName} 发消息…` : '连接中…'}
              disabled={!connected}
              rows={1}
            />
            <div className="sh-composer-tools">
              <Button
                className="sh-tool-btn btn-semi"
                htmlType="button"
                title="表情"
                aria-label="表情"
                aria-expanded={emojiOpen}
                onClick={() => setEmojiOpen((v) => !v)}
              >
                <IcEmoji />
              </Button>
              <Button
                className="sh-tool-btn btn-semi"
                htmlType="button"
                title="附件"
                aria-label="附件"
                disabled={!connected || attachBusy}
                onClick={() => pickAttachment('file')}
              >
                <IcClip />
              </Button>
              <Button
                className="sh-tool-btn btn-semi"
                htmlType="button"
                title="图片"
                aria-label="图片"
                disabled={!connected || attachBusy}
                onClick={() => pickAttachment('image')}
              >
                <IcImage />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => onAttachmentPicked(e, 'file')}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => onAttachmentPicked(e, 'image')}
              />
              <span className="sh-composer-spacer" />
              <span className="sh-composer-hint">{attachBusy ? '上传中…' : 'Enter 发送'}</span>
              <Button className="sh-send-btn btn-semi" htmlType="button" onClick={send} disabled={!connected || !draft.trim()}>
                发送
              </Button>
            </div>
          </div>
        </div>
      </main>

      {chanDialog && (
        <Modal
          visible
          onCancel={() => setChanDialog(null)}
          footer={null}
          header={null}
          closable={false}
          modalContentClass="sh-modal sh-modal-form"
          width={440}
          centered
        >
            <div className="sh-modal-title">
              {chanDialog.mode === 'create'
                ? '新建频道'
                : `编辑「${chanDialog.target?.display || chanDialog.target?.name || ''}」`}
            </div>
            <div className="sh-modal-desc">
              {chanDialog.mode === 'create'
                ? '填好频道信息后创建；没有权限时服务器会拒绝并在右下角提示。'
                : '只提交改动过的字段，清空描述即可删除描述。'}
            </div>

            <div className="sh-form">
              <label className="sh-form-row">
                <span className="sh-form-label">名称</span>
                <Input
                  className="sh-form-input"
                  value={chanForm.name}
                  maxLength={60}
                  autoFocus
                  onChange={(value) => setChanForm((f) => ({ ...f, name: value }))}
                  placeholder="频道名称"
                />
              </label>

              {chanDialog.mode === 'edit' && (
                <div className="sh-form-row">
                  <span className="sh-form-label">头像</span>
                  <div className="sh-form-inline sh-chan-icon-edit">
                    <span className="sh-chan-icon-preview">
                      <ChannelIcon iconId={chanForm.iconId} token={state.avatarToken ?? ''} />
                    </span>
                    <Button size="small" loading={chanIconBusy} onClick={() => chanIconInput.current?.click()}>
                      选择图片
                    </Button>
                    {chanForm.iconId > 0 && (
                      <Button size="small" type="tertiary" onClick={() => setChanForm((f) => ({ ...f, iconId: 0 }))}>
                        移除
                      </Button>
                    )}
                    <input
                      ref={chanIconInput}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const picked = e.target.files?.[0];
                        e.target.value = '';
                        if (picked) void pickChanIcon(picked);
                      }}
                    />
                  </div>
                </div>
              )}

              <label className="sh-form-row">
                <span className="sh-form-label">描述</span>
                <TextArea
                  className="sh-form-input sh-form-textarea"
                  value={chanForm.description}
                  maxLength={300}
                  rows={2}
                  borderless
                  onChange={(value) => setChanForm((f) => ({ ...f, description: value }))}
                  placeholder="可选，显示在频道头部"
                />
              </label>

              {chanDialog.mode === 'create' && (
                <label className="sh-form-row">
                  <span className="sh-form-label">父频道</span>
                  <Select
                    className="sh-form-select"
                    value={chanForm.parent}
                    onChange={(value) => setChanForm((f) => ({ ...f, parent: Number(value) }))}
                  >
                    <Select.Option value={0}>（根目录）</Select.Option>
                    {flat
                      .filter((r) => !r.channel.spacer)
                      .map(({ channel, depth }) => (
                        <Select.Option key={channel.id} value={channel.id}>
                          {'　'.repeat(depth) + (channel.display || channel.name)}
                        </Select.Option>
                      ))}
                  </Select>
                </label>
              )}

              <div className="sh-form-row">
                <span className="sh-form-label">类型</span>
                <Select
                  className="sh-form-select"
                  value={chanForm.kind}
                  onChange={(value) => setChanForm((f) => ({ ...f, kind: value as ChannelKind }))}
                >
                  <Select.Option value="permanent">永久</Select.Option>
                  <Select.Option value="semi">半永久</Select.Option>
                  <Select.Option value="temporary">临时</Select.Option>
                </Select>
              </div>

              <div className="sh-form-row">
                <span className="sh-form-label">编解码</span>
                <Select
                  className="sh-form-select"
                  value={chanForm.codec}
                  onChange={(value) => setChanForm((f) => ({ ...f, codec: Number(value) }))}
                >
                  <Select.Option value={4}>Opus Voice</Select.Option>
                  <Select.Option value={5}>Opus Music</Select.Option>
                </Select>
              </div>

              <div className="sh-form-row">
                <span className="sh-form-label">音质</span>
                <div className="sh-form-inline">
                  <Slider
                    className="sh-form-range"
                    min={0}
                    max={10}
                    step={1}
                    value={chanForm.quality}
                    aria-label="音质"
                    onChange={(value) => setChanForm((f) => ({ ...f, quality: Number(value) }))}
                  />
                  <span className="sh-form-val">{chanForm.quality}</span>
                </div>
              </div>

              <div className="sh-form-row">
                <span className="sh-form-label">最大人数</span>
                <div className="sh-form-inline">
                  <InputNumber
                    className="sh-form-input"
                    min={-1}
                    value={chanForm.maxClients}
                    hideButtons
                    aria-label="最大人数"
                    onChange={(value) => setChanForm((f) => ({ ...f, maxClients: Number(value) }))}
                  />
                  <span className="sh-form-hint">-1 表示不限</span>
                </div>
              </div>

              <div className="sh-form-row">
                <span className="sh-form-label">密码</span>
                <Checkbox
                  className="sh-form-check"
                  checked={chanForm.password}
                  onChange={(e) => setChanForm((f) => ({ ...f, password: !!e.target.checked }))}
                >
                  设置频道密码
                </Checkbox>
              </div>

              {chanForm.password && (
                <label className="sh-form-row">
                  <span className="sh-form-label">{chanDialog.mode === 'edit' ? '新密码' : '密码'}</span>
                  <Input
                    className="sh-form-input"
                    mode="password"
                    value={chanForm.newPassword}
                    onChange={(value) => setChanForm((f) => ({ ...f, newPassword: value }))}
                    placeholder={chanDialog.mode === 'edit' ? '留空则不修改原密码' : '频道密码'}
                  />
                </label>
              )}
            </div>

            <div className="sh-modal-actions">
              <Button className="sh-btn-ghost btn-semi" htmlType="button" onClick={() => setChanDialog(null)}>
                取消
              </Button>
              <Button className="sh-btn-primary btn-semi" htmlType="button" onClick={submitChannel}>
                {chanDialog.mode === 'create' ? '创建' : '保存'}
              </Button>
            </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          visible
          onCancel={() => setDeleteTarget(null)}
          footer={null}
          header={null}
          closable={false}
          modalContentClass="sh-modal"
          width={360}
          centered
        >
            <div className="sh-modal-title">删除「{deleteTarget.display || deleteTarget.name}」</div>
            <div className="sh-modal-desc">
              会连同其子频道一起删除，频道里的人会被移到默认频道。此操作不可撤销。
            </div>
            <div className="sh-modal-actions">
              <Button className="sh-btn-ghost btn-semi" htmlType="button" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button className="sh-btn-danger btn-semi" htmlType="button" onClick={confirmDeleteChannel}>
                删除
              </Button>
            </div>
        </Modal>
      )}

      {pwChannel && (
        <Modal
          visible
          onCancel={() => setPwChannel(null)}
          footer={null}
          header={null}
          closable={false}
          modalContentClass="sh-modal"
          width={360}
          centered
        >
            <div className="sh-modal-title">加入「{pwChannel.display || pwChannel.name}」</div>
            <div className="sh-modal-desc">这个频道有密码，请输入后加入。</div>
            <Input
              className="sh-modal-input"
              mode="password"
              value={pwValue}
              onChange={(value) => setPwValue(value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitPassword();
              }}
              placeholder="频道密码"
              autoFocus
            />
            <div className="sh-modal-actions">
              <Button className="sh-btn-ghost btn-semi" htmlType="button" onClick={() => setPwChannel(null)}>
                取消
              </Button>
              <Button className="sh-btn-primary btn-semi" htmlType="button" onClick={submitPassword}>
                加入
              </Button>
            </div>
        </Modal>
      )}

      {modTarget && (
        <Modal
          visible
          onCancel={() => setModTarget(null)}
          footer={null}
          header={null}
          closable={false}
          modalContentClass="sh-modal"
          width={400}
          centered
        >
          <div className="sh-modal-title">
            {modTarget.kind === 'channel'
              ? `把「${modTarget.member.nickname}」踢出频道`
              : modTarget.kind === 'server'
                ? `把「${modTarget.member.nickname}」踢出服务器`
                : `封禁「${modTarget.member.nickname}」`}
          </div>
          <div className="sh-modal-desc">
            {modTarget.kind === 'channel'
              ? '该成员会回到默认频道，仍留在服务器上。'
              : modTarget.kind === 'server'
                ? '该成员会被断开连接，但之后还能重新加入。'
                : '封禁后该成员将无法再进入，直到封禁到期；时长选「永久」则一直有效。'}
          </div>
          <div className="sh-form">
            <label className="sh-form-row">
              <span className="sh-form-label">原因</span>
              <TextArea
                className="sh-form-input sh-form-textarea"
                value={modReason}
                maxLength={200}
                rows={3}
                borderless
                onChange={(value) => setModReason(value)}
                placeholder="可选，会告知对方"
              />
            </label>
            {modTarget.kind === 'ban' && (
              <div className="sh-form-row">
                <span className="sh-form-label">时长</span>
                <Select
                  className="sh-form-select"
                  value={banSeconds}
                  onChange={(value) => setBanSeconds(Number(value))}
                >
                  <Select.Option value={60}>1 分钟</Select.Option>
                  <Select.Option value={600}>10 分钟</Select.Option>
                  <Select.Option value={3600}>1 小时</Select.Option>
                  <Select.Option value={86400}>1 天</Select.Option>
                  <Select.Option value={0}>永久</Select.Option>
                </Select>
              </div>
            )}
          </div>
          <div className="sh-modal-actions">
            <Button className="sh-btn-ghost btn-semi" htmlType="button" onClick={() => setModTarget(null)}>
              取消
            </Button>
            <Button
              className={`${modTarget.kind === 'ban' ? 'sh-btn-danger' : 'sh-btn-primary'} btn-semi`}
              htmlType="button"
              onClick={submitMod}
            >
              确定
            </Button>
          </div>
        </Modal>
      )}

      {/* 频道文件区：右侧抽屉，复用旧 FilesPanel，浏览/上传/下载/改名/删除/建目录 */}
      <FilesPanel
        open={filesOpen}
        cid={state.ownChannel}
        channelName={channelName}
        token={fileToken}
        listing={files}
        onList={onListFiles ?? (() => {})}
        onClose={() => setFilesOpen(false)}
      />

      {/* 好友与云聊天：右侧抽屉，复用旧 FriendsPanel；在线好友走服务器私聊，离线走 Matrix 云聊天 */}
      <FriendsPanel
        open={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        friends={friends}
        account={account}
        cloud={cloud}
        chat={cloudChat}
        notice={cloudNotice}
        onlineUids={onlineUids}
        onlineByName={onlineByName}
        memberById={memberById}
        avatarToken={avatarToken}
        accountAvatar={account.avatarUrl}
        serverLines={allChat}
        ownId={state.ownId}
        onSendServer={(clientId, text) => onPrivately?.(clientId, text)}
        onConnect={onCloudConnect ?? (() => {})}
        onDisconnect={onCloudDisconnect ?? (() => {})}
        onOpenFriend={(friend) => onCloudOpen?.(friend)}
        onSend={(roomId, text) => onCloudSend?.(roomId, text)}
        onHistory={(roomId) => onCloudHistory?.(roomId)}
        onDismissNotice={onDismissCloudNotice ?? (() => {})}
      />

    </div>
  );
}

/** 频道表单的本地状态。 */
type ChanForm = {
  name: string;
  description: string;
  parent: number;
  kind: ChannelKind;
  password: boolean;
  newPassword: string;
  codec: number;
  quality: number;
  maxClients: number;
  iconId: number;
};

function defaultChanForm(): ChanForm {
  return {
    name: '',
    description: '',
    parent: 0,
    kind: 'permanent',
    password: false,
    newPassword: '',
    codec: 4,
    quality: 6,
    maxClients: -1,
    iconId: 0,
  };
}

/** 本地 findChannel，避免每个渲染都深搜两次。 */
function findChannelSafe(tree: ChannelNode[], id: number): ChannelNode | null {
  for (const c of tree) {
    if (c.id === id) return c;
    const deep = findChannelSafe(c.children, id);
    if (deep) return deep;
  }
  return null;
}
