import { useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown, Popover, SideSheet, Switch, Toast } from '@douyinfe/semi-ui';
import {
  IconMore,
  IconPlus,
  IconMicrophone,
  IconMicrophoneOff,
  IconVolume2,
  IconVolumnSilent,
  IconUserGroup,
  IconFolder,
  IconChevronDown,
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
  type ChannelNode,
  type ChatLine,
  type CloudChat,
  type CloudState,
  type ContactsMessage,
  type FilesMessage,
  type Friend,
  type Member,
  type PersonDetails,
  type State,
} from '../protocol';
import { avatarColor, avatarSources, initial } from '../ui';
import { gainPercent } from '../audio/gain';
import VolumePopover from './VolumePopover';
import AwayPopover from './AwayPopover';
import UserCard from './UserCard';
import ChannelIcon from './ChannelIcon';
import FilesPanel from './FilesPanel';
import FriendsPanel from './FriendsPanel';
import './server-home.css';

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
  /** 开始共享摄像头。 */
  onShareCamera?: () => void;
  /** 停止自己的共享。 */
  onStopShare?: () => void;
  /** 观看某个成员的直播。 */
  onWatch?: (clientId: number) => void;
  /** 停止观看。 */
  onStopWatch?: () => void;
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

/** 头像：优先真实图片（账号 / 服务器 / myTeamSpeak），失败逐级回退到首字母色块。 */
function Avatar({
  id,
  name,
  avatar,
  myTeamSpeakAvatar,
  ownId,
  avatarToken,
  accountAvatar,
  size,
}: {
  id: number;
  name: string;
  avatar?: string;
  myTeamSpeakAvatar?: string;
  ownId: number;
  avatarToken: string;
  accountAvatar: string;
  size: number;
}) {
  const sources = useMemo(
    () => avatarSources({ id, avatar, myTeamSpeakAvatar }, ownId, accountAvatar, avatarToken),
    [id, avatar, myTeamSpeakAvatar, ownId, accountAvatar, avatarToken],
  );
  const [idx, setIdx] = useState(0);
  const src = sources[idx];
  if (src) {
    return (
      <div className="sh-avatar" style={{ width: size, height: size }}>
        <img src={src} alt={name} onError={() => setIdx((i) => i + 1)} />
      </div>
    );
  }
  return (
    <div
      className="sh-avatar"
      style={{
        width: size,
        height: size,
        background: avatarColor(id),
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initial(name)}
    </div>
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
  const [filesOpen, setFilesOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // 一次性摊平整棵树：既保留父→子顺序，又方便过滤。
  const flat = useMemo(() => flatten(state.tree), [state.tree]);

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

  // 新消息自动滚到底
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const toggleCollapse = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tryJoin = (ch: ChannelNode) => {
    if (ch.spacer || ch.id === state.ownChannel) return;
    if (ch.password) {
      setPwValue('');
      setPwChannel(ch);
      return;
    }
    onJoinChannel(ch.id);
  };

  const submitPassword = () => {
    if (!pwChannel) return;
    onJoinChannel(pwChannel.id, pwValue);
    setPwChannel(null);
    setPwValue('');
  };

  const send = () => {
    const text = draft.trim();
    if (!text || !connected) return;
    onSay(text);
    setDraft('');
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
  const online = info?.clientsOnline ?? state.clientCount;
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
    <div className="sh-shell">
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
            <button className="sh-more-btn" type="button" title="更多" onClick={() => setMoreOpen((v) => !v)}>
              <IconMore />
            </button>
          </div>

          <div className="sh-server-status">
            {searchOpen ? (
              <input
                className="sh-search sh-search-inline"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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
            <button
              className="sh-status-search"
              type="button"
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
            </button>
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
            <button
              className="sh-sec-plus"
              type="button"
              title="新建频道"
              onClick={() => Toast.info('频道管理暂未接入，下一步再做')}
            >
              <IconPlus size="small" />
            </button>
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
            return (
              <div key={channel.id}>
                <button
                  className={`sh-chan${selected ? ' selected' : ''}`}
                  type="button"
                  title={selected ? '当前所在频道' : '双击进入频道'}
                  onDoubleClick={() => tryJoin(channel)}
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
                </button>

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
                          <button
                            type="button"
                            className="sh-member-live"
                            onClick={(e) => {
                              e.stopPropagation();
                              onWatch?.(m.id);
                            }}
                            title="直播中，点击观看"
                          >
                            <span className="sh-live-dot" />
                            直播中
                          </button>
                        ) : null}
                        {m.away ? <span className="sh-member-away">离开</span> : null}
                        {speaking ? <span className="sh-member-dot" /> : null}
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
            <span>双击频道即可进入</span>
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
          />
          <div className="sh-me-info">
            <div className="sh-me-name">{ownMember?.nickname ?? state.nickname}</div>
            <div className="sh-me-status">
              <span className={`sh-me-dot${state.away ? ' away' : ''}`} />
              {state.away ? '离开中' : micOn && micGain > 0 ? '在线 · 麦克风开启' : '在线 · 麦克风关闭'}
            </div>
          </div>
          <div className="sh-me-actions">
            <VolumePopover
              title="麦克风音量"
              value={micGain}
              onChange={(v) => onMicGain?.(v)}
            >
              <button
                className={`sh-me-btn${micOn && micGain > 0 ? ' on' : ''}`}
                type="button"
                title="麦克风音量（拖到 0 即静音）"
                aria-label={`麦克风音量 ${gainPercent(micGain)}%`}
                onClick={() => {
                  if (!micOn) void onToggleInput();
                }}
              >
                {micOn && micGain > 0 ? <IconMicrophone size="small" /> : <IconMicrophoneOff size="small" />}
              </button>
            </VolumePopover>
            <VolumePopover
              title="扬声器音量"
              value={outputGain}
              onChange={(v) => onOutputGain?.(v)}
              zeroHint="为 0 时你听不到声音"
            >
              <button
                className={`sh-me-btn${state.outputMuted || outputGain === 0 ? '' : ' on'}`}
                type="button"
                title={`扬声器音量 ${gainPercent(outputGain)}%`}
                aria-label={`扬声器音量 ${gainPercent(outputGain)}%`}
              >
                {state.outputMuted || outputGain === 0 ? (
                  <IconVolumnSilent size="small" />
                ) : (
                  <IconVolume2 size="small" />
                )}
              </button>
            </VolumePopover>
            <AwayPopover
              away={away}
              awayMessage={awayMessage}
              onToggleAway={(v) => onToggleAway?.(v)}
              onSetAwayMessage={(m) => onSetAwayMessage?.(m)}
            >
              <button
                className={`sh-me-btn${away ? ' on' : ''}`}
                type="button"
                title={away ? '离开中，点此修改暂离设置' : '设置暂离状态'}
                aria-pressed={away}
              >
                <IconMoon size="small" />
              </button>
            </AwayPopover>
          </div>
        </footer>

        {moreOpen && (
          <>
            <div className="sh-more-backdrop" onClick={() => setMoreOpen(false)} />
            <div className="sh-more">
              <div className="sh-more-bar">
                <span className="sh-more-bar-title">服务器信息</span>
                <button className="sh-more-close" type="button" onClick={() => setMoreOpen(false)} title="关闭">
                  <IconClose size="small" />
                </button>
              </div>

              <div className="sh-more-user">
                <Avatar
                  id={state.ownId}
                  name={ownMember?.nickname ?? state.nickname}
                  ownId={state.ownId}
                  avatarToken={avatarToken}
                  accountAvatar={account.avatarUrl}
                  size={42}
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
                  <button className="sh-copy" type="button" onClick={() => void copyAddress()}>
                    复制
                  </button>
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

              <button
                className="sh-leave"
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onDisconnect();
                }}
              >
                <IconExit size="small" />
                <span>离开</span>
              </button>
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
        </div>
      </SideSheet>

      {/* ================= 右栏 ================= */}
      <main className="sh-chat">
        <header className="sh-chat-head">
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
              <button
                className={`sh-icon-btn${stream.sharing !== null ? ' is-live' : ''}`}
                type="button"
                title={stream.sharing !== null ? '直播中，点击管理' : '开始直播（屏幕 / 摄像头）'}
                aria-pressed={stream.sharing !== null}
              >
                <IcMonitor />
              </button>
            </Dropdown>
            <button
              className="sh-icon-btn"
              type="button"
              title="频道文件"
              onClick={() => setFilesOpen(true)}
            >
              <IconFolder />
            </button>
            <button
              className="sh-icon-btn"
              type="button"
              title="好友与云聊天"
              aria-pressed={friendsOpen}
              onClick={openFriends}
            >
              <IconUserGroup />
            </button>
            <button
              className="sh-icon-btn"
              type="button"
              title="设置"
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <IconSetting />
            </button>
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

        <div
          className="sh-messages"
          ref={listRef}
          onScroll={(e) => {
            if (e.currentTarget.scrollTop < 40 && chatMore && !chatBusy) onLoadMoreChat();
          }}
        >
          {chatBusy && <div className="sh-more-hint">加载更早的消息…</div>}
          {chat.length === 0 ? (
            <div className="sh-chat-empty">还没有消息，来打个招呼吧。</div>
          ) : (
            <>
              <div className="sh-day-divider">
                <span>今天</span>
              </div>
              {chat.map((line, i) => (
                <div className={`sh-msg${line.mine ? ' mine' : ''}`} key={`${line.time}-${line.from}-${i}`}>
                  <Avatar
                    id={line.from}
                    name={line.name}
                    avatar={line.avatar}
                    myTeamSpeakAvatar={line.myTeamSpeakAvatar}
                    ownId={state.ownId}
                    avatarToken={avatarToken}
                    accountAvatar={account.avatarUrl}
                    size={40}
                  />
                  <div className="sh-msg-body">
                    <div className="sh-msg-meta">
                      <span className="sh-msg-name">{line.name}</span>
                      {line.mine && <span className="sh-badge-me">我</span>}
                      <span className="sh-msg-time">{fmtTime(line.time)}</span>
                    </div>
                    <div className="sh-msg-text">{line.text}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="sh-composer">
          <div className="sh-composer-box">
            <textarea
              className="sh-composer-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
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
              <button className="sh-tool-btn" type="button" title="表情">
                <IcEmoji />
              </button>
              <button className="sh-tool-btn" type="button" title="附件">
                <IcClip />
              </button>
              <button className="sh-tool-btn" type="button" title="图片">
                <IcImage />
              </button>
              <span className="sh-composer-spacer" />
              <span className="sh-composer-hint">Enter 发送</span>
              <button className="sh-send-btn" type="button" onClick={send} disabled={!connected || !draft.trim()}>
                发送
              </button>
            </div>
          </div>
        </div>
      </main>

      {pwChannel && (
        <div className="sh-modal-mask" onClick={() => setPwChannel(null)}>
          <div className="sh-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sh-modal-title">加入「{pwChannel.display || pwChannel.name}」</div>
            <div className="sh-modal-desc">这个频道有密码，请输入后加入。</div>
            <input
              className="sh-modal-input"
              type="password"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitPassword();
              }}
              placeholder="频道密码"
              autoFocus
            />
            <div className="sh-modal-actions">
              <button className="sh-btn-ghost" type="button" onClick={() => setPwChannel(null)}>
                取消
              </button>
              <button className="sh-btn-primary" type="button" onClick={submitPassword}>
                加入
              </button>
            </div>
          </div>
        </div>
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

/** 本地 findChannel，避免每个渲染都深搜两次。 */
function findChannelSafe(tree: ChannelNode[], id: number): ChannelNode | null {
  for (const c of tree) {
    if (c.id === id) return c;
    const deep = findChannelSafe(c.children, id);
    if (deep) return deep;
  }
  return null;
}
