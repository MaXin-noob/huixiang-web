import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  Switch,
  TextArea,
  Toast,
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
  IconChevronLeft,
  IconChevronRight,
  IconLock,
  IconClose,
  IconExit,
  IconMoon,
  IconSetting,
} from '@douyinfe/semi-icons';
import StreamPanel from './StreamPanel';
import { initialStreamState, type StreamState } from '../stream';
import {
  eachMember,
  emptyCloud,
  emptyContacts,
  findMember,
  flatten,
  memberKey,
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
  type State,
} from '../protocol';
import { avatarColor, avatarSources, initial } from '../ui';
import { convertShortcodes, isEmojiOnly, EMOJI_LIST } from '../emoji';
import { gainPercent } from '../audio/gain';
import VolumePopover from './VolumePopover';
import AwayPopover from './AwayPopover';
import UserCard from './UserCard';
import ChannelIcon from './ChannelIcon';
import FilesPanel from './FilesPanel';
import FriendsPanel from './FriendsPanel';
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
  /** 浏览器 ↔ 网关的 WebSocket 往返（ms），未知为 null。 */
  pingGateway: number | null;
  /** 网关 ↔ TeamSpeak 的 UDP 往返（ms），未知为 null。 */
  pingServer: number | null;
  micOn: boolean;
  micLevel: number;
  ownTalking: boolean;
  talkingIds: ReadonlySet<number>;
  onJoinChannel: (cid: number, password?: string) => void;
  onSay: (text: string) => void;
  onToggleInput: () => void;
  onToggleOutput: () => void;
  onDisconnect: () => void;
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
  /** 开始共享屏幕。 */
  onShareScreen?: () => void;
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
    pingGateway,
    pingServer,
    micOn,
    ownTalking,
    talkingIds,
    onJoinChannel,
    onSay,
    onToggleInput,
    onDisconnect,
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
    onShareScreen,
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

  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pwChannel, setPwChannel] = useState<ChannelNode | null>(null);
  const [pwValue, setPwValue] = useState('');
  // 频道管理：新建/编辑表单、删除确认、行内「更多」菜单。
  const [chanDialog, setChanDialog] = useState<{ mode: 'create' | 'edit'; target: ChannelNode | null } | null>(null);
  const [chanForm, setChanForm] = useState<ChanForm>(() => defaultChanForm());
  const [deleteTarget, setDeleteTarget] = useState<ChannelNode | null>(null);
  // 成员管理：踢出频道 / 踢出服务器 / 封禁（弹窗里填原因、选封禁时长）。
  const [modTarget, setModTarget] = useState<{ member: Member; kind: 'channel' | 'server' | 'ban' } | null>(null);
  const [modReason, setModReason] = useState('');
  const [banSeconds, setBanSeconds] = useState(600);
  const [filesOpen, setFilesOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** 移动端：频道页 / 聊天页。桌面端由 CSS 忽略，不影响双栏布局。 */
  const [mobilePane, setMobilePane] = useState<'channels' | 'chat'>('channels');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
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

  // 新消息自动滚到底（AIChatDialogue 内部自己滚动）
  useEffect(() => {
    const el = dlgRef.current?.containerRef.current;
    if (el) {
      dlgRef.current?.scrollToBottom(false);
      return;
    }
    const fallback = listRef.current;
    if (fallback) fallback.scrollTop = fallback.scrollHeight;
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
    });
    setChanDialog({ mode: 'edit', target: ch });
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
  const pingTotal = pingGateway != null && pingServer != null ? pingGateway + pingServer : null;
  const latencyValue = pingTotal ?? pingServer ?? pingGateway;
  const latency = latencyValue != null ? `延迟 ${latencyValue} ms` : '延迟 —';
  const banner = info?.bannerUrl ?? null;

  const ownMember = findMember(state.tree, state.ownId);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(state.address);
      Toast.success('地址已复制');
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
                  content={
                    <div className="sh-latency-detail">
                      <div className="sh-latency-row">
                        <span>浏览器 ↔ 网关</span>
                        <b>{pingGateway != null ? `${pingGateway} ms` : '—'}</b>
                      </div>
                      <div className="sh-latency-row">
                        <span>网关 ↔ 服务器</span>
                        <b>{pingServer != null ? `${pingServer} ms` : '—'}</b>
                      </div>
                      <div className="sh-latency-row sh-latency-total">
                        <span>合计</span>
                        <b>{pingTotal != null ? `${pingTotal} ms` : '—'}</b>
                      </div>
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
                  {channel.clients.some((m) => m.streaming) && (
                    <span className="sh-chan-live">
                      <span className="sh-live-dot" />
                      直播中
                    </span>
                  )}
                  <Dropdown
                    trigger="click"
                    position="bottomRight"
                    spacing={6}
                    stopPropagation
                    render={
                      <Dropdown.Menu className="sh-chan-dd">
                        <Dropdown.Item icon={<IconPlus />} onClick={() => openCreateChannel(channel.id)}>
                          <span className="sh-dd-label">新建子频道</span>
                        </Dropdown.Item>
                        <Dropdown.Item icon={<IconEdit />} onClick={() => openEditChannel(channel)}>
                          <span className="sh-dd-label">编辑频道</span>
                        </Dropdown.Item>
                        <Dropdown.Item disabled={!canMoveUp} onClick={() => moveChannel(channel, -1)}>
                          <span className="sh-dd-label">上移</span>
                        </Dropdown.Item>
                        <Dropdown.Item disabled={!canMoveDown} onClick={() => moveChannel(channel, 1)}>
                          <span className="sh-dd-label">下移</span>
                        </Dropdown.Item>
                        <Dropdown.Divider />
                        <Dropdown.Item
                          icon={<IconCopy />}
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(String(channel.id))
                              .then(() => Toast.success('已复制频道 ID'))
                              .catch(() => Toast.error('复制失败'));
                          }}
                        >
                          <span className="sh-dd-label">复制频道 ID</span>
                        </Dropdown.Item>
                        <Dropdown.Divider />
                        <Dropdown.Item type="danger" icon={<IconDelete />} onClick={() => setDeleteTarget(channel)}>
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
                    return (
                    <Popover
                      key={m.id}
                      trigger="hover"
                      position="right"
                      showArrow
                      content={
                        <UserCard
                          member={m}
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
                      <div className={`sh-member${speaking ? ' talking' : ''}${m.streaming ? ' is-live' : ''}`}>
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
                        {m.streaming ? (
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
                        {m.away ? <span className="sh-member-away">离开</span> : null}
                        {speaking ? <span className="sh-member-dot" /> : null}
                        {m.id !== state.ownId && (
                          <Dropdown
                            trigger="click"
                            position="bottomRight"
                            spacing={4}
                            stopPropagation
                            render={
                              <Dropdown.Menu className="sh-chan-dd">
                                <Dropdown.Item onClick={() => openMod(m, 'channel')}>
                                  <span className="sh-dd-label">踢出频道</span>
                                </Dropdown.Item>
                                <Dropdown.Item onClick={() => openMod(m, 'server')}>
                                  <span className="sh-dd-label">踢出服务器</span>
                                </Dropdown.Item>
                                <Dropdown.Divider />
                                <Dropdown.Item type="danger" onClick={() => openMod(m, 'ban')}>
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
            >
              <Button
                className={`sh-me-btn${micOn && micGain > 0 ? ' on' : ''} btn-semi`}
                htmlType="button"
                title="麦克风音量（拖到 0 即静音）"
                aria-label={`麦克风音量 ${gainPercent(micGain)}%`}
                onClick={() => {
                  if (!micOn) void onToggleInput();
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
            >
              <Button
                className={`sh-me-btn${state.outputMuted || outputGain === 0 ? '' : ' on'} btn-semi`}
                htmlType="button"
                title={`扬声器音量 ${gainPercent(outputGain)}%`}
                aria-label={`扬声器音量 ${gainPercent(outputGain)}%`}
              >
                {state.outputMuted || outputGain === 0 ? (
                  <IconVolumnSilent size="small" />
                ) : (
                  <IconVolume2 size="small" />
                )}
              </Button>
            </VolumePopover>
            <AwayPopover
              away={away}
              awayMessage={awayMessage}
              onToggleAway={(v) => onToggleAway?.(v)}
              onSetAwayMessage={(m) => onSetAwayMessage?.(m)}
            >
              <Button
                className={`sh-me-btn${away ? ' on' : ''} btn-semi`}
                htmlType="button"
                title={away ? '离开中，点此修改暂离设置' : '设置暂离状态'}
                aria-pressed={away}
              >
                <IconMoon size="small" />
              </Button>
            </AwayPopover>
          </div>
        </footer>

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
        title="设置"
        visible={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        width={430}
        placement="right"
        className="files-sheet"
      >
        <div className="files-body">
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
              {channelDesc ? ` · ${channelDesc}` : ''}
            </div>
          </div>
          <div className="sh-chat-actions">
            <Dropdown
              trigger="click"
              position="bottomRight"
              menu={[
                { node: 'item' as const, name: '共享屏幕 - WebRTC', onClick: () => onShareScreen?.() },
                {
                  node: 'item' as const,
                  name: '共享屏幕 - 流媒体中继',
                  onClick: () => Toast.info('流媒体中继功能正在开发中，敬请期待'),
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
            <Button
              className="sh-icon-btn btn-semi"
              htmlType="button"
              title="好友与云聊天"
              aria-pressed={friendsOpen}
              onClick={openFriends}
            >
              <IconUserGroup />
            </Button>
            <Button
              className="sh-icon-btn btn-semi"
              htmlType="button"
              title="设置"
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen((v) => !v)}
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
                          live={!!findMember(state.tree, line.from)?.streaming}
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
                onClick={() => Toast.info('该功能正在开发中')}
              >
                <IcClip />
              </Button>
              <Button
                className="sh-tool-btn btn-semi"
                htmlType="button"
                title="图片"
                aria-label="图片"
                onClick={() => Toast.info('该功能正在开发中')}
              >
                <IcImage />
              </Button>
              <span className="sh-composer-spacer" />
              <span className="sh-composer-hint">Enter 发送</span>
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
