import { Button, Slider } from '@douyinfe/semi-ui';
import type { Member, PersonDetails } from '../protocol';
import { avatarSources } from '../ui';
import UserAvatar from './UserAvatar';

/** client_user_tag 可能是官方签名 JSON；只取其中公开的 tag 文本，取不到就按原文显示。 */
function parseUserTag(raw?: string): string {
  const text = (raw ?? '').trim();
  if (!text) return '';
  try {
    const obj = JSON.parse(text) as { tag?: unknown };
    if (obj && typeof obj.tag === 'string' && obj.tag.trim()) return obj.tag.trim();
  } catch {
    /* 不是 JSON，按原文处理 */
  }
  return text;
}

/** 把 Unix 秒的连接时刻换算成「已在线多久」，服务器没给（<=0）时返回空串。 */
function formatOnlineDuration(fromUnixSeconds?: number): string {
  if (!fromUnixSeconds || fromUnixSeconds <= 0) return '';
  const diff = Math.floor(Date.now() / 1000) - fromUnixSeconds;
  if (diff < 0) return '';
  const day = Math.floor(diff / 86400);
  const hour = Math.floor((diff % 86400) / 3600);
  const minute = Math.floor((diff % 3600) / 60);
  if (day > 0) return `${day} 天 ${hour} 小时`;
  if (hour > 0) return `${hour} 小时 ${minute} 分`;
  if (minute > 0) return `${minute} 分钟`;
  return '刚刚';
}

interface Props {
  member: Member;
  /** 这个人所在频道名（舞台里就是当前频道）。 */
  channelName: string;
  ownId: number;
  accountAvatar: string;
  avatarToken: string;
  /** 服务器补问回来的公开字段：描述、地区、客户端、在线时长、MyTeamSpeak 用户标签。 */
  details?: PersonDetails;
  /** 个人音量（0–2，0 = 单独静音），缺省 1。 */
  volume?: number;
  onVolume?: (v: number) => void;
  /** 戳一戳这个人（右上角按钮）；不传则不显示，自己的卡片也不显示。 */
  onPoke?: () => void;
  /**
   * 是否正在直播。传入时以此为准，缺省回退到 member.streaming。
   * 因为网页直播（LiveKit）不走 TS 的 streaming 字段，需由外部把网关广播的名单合并进来。
   */
  live?: boolean;
}

/**
 * 用户资料卡：悬停在成员上时浮出来的一张小卡片。
 * 显示频道、身份组、音量，以及服务器公开的资料（地区、客户端、在线时长、描述）和 MyTeamSpeak 用户标签。
 */
export default function UserCard({
  member,
  channelName,
  ownId,
  accountAvatar,
  avatarToken,
  details,
  volume = 1,
  onVolume,
  onPoke,
  live,
}: Props) {
  const me = member.id === ownId;
  const isLive = live ?? member.streaming;
  const groups = [member.channelGroup, ...member.serverGroups].filter((g) => !!g && g.trim().length > 0);
  const pct = Math.round(Math.min(2, Math.max(0, volume)) * 100);
  const userTag = parseUserTag(details?.userTag || member.userTag);
  const country = (details?.country || member.country || '').trim();
  const onlineFor = formatOnlineDuration(details?.connectionTime || member.connectionTime);
  const description = (details?.description || member.description || '').trim();

  return (
    <div className="user-card">
      <div className="user-card-head">
        <UserAvatar
          name={member.nickname}
          sources={avatarSources(member, ownId, accountAvatar, avatarToken)}
          colorKey={me ? 'me' : member.uid || member.id}
          className="user-card-avatar"
          live={isLive}
          size={52}
        />
        <div className="user-card-ident">
          <div className="user-card-name" title={member.nickname}>
            {member.nickname}
            {me && <span className="user-card-me">我</span>}
          </div>
          <div className="user-card-badges">
            {member.away ? (
              <span className="uc-badge uc-away">离开</span>
            ) : (
              <span className="uc-badge uc-online">在线</span>
            )}
            {isLive && <span className="uc-badge uc-live">直播中</span>}
            {member.inputMuted && <span className="uc-badge uc-mute">麦克风静音</span>}
            {!member.inputMuted && member.outputMuted && <span className="uc-badge uc-mute">扬声器静音</span>}
            {member.priority && <span className="uc-badge uc-priority">优先发言人</span>}
            {userTag && (
              <span className="uc-badge uc-myts" title={userTag}>
                MyTeamSpeak 已验证
              </span>
            )}
          </div>
        </div>
        {!me && onPoke && (
          <Button htmlType="button" className="uc-poke btn-semi" onClick={onPoke} title="戳一戳">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3v10m0 0l3-3m-3 3l-3-3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M4.5 15.5v1.8A4.7 4.7 0 009.2 22h5.6a4.7 4.7 0 004.7-4.7v-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            戳一戳
          </Button>
        )}
      </div>

      <dl className="user-card-rows">
        <div className="uc-row">
          <dt>频道</dt>
          <dd>{channelName || '—'}</dd>
        </div>
        {groups.length > 0 && (
          <div className="uc-row">
            <dt>身份组</dt>
            <dd className="uc-groups">
              {groups.map((g) => (
                <span className="uc-group" key={g}>
                  {g}
                </span>
              ))}
            </dd>
          </div>
        )}
        {country && (
          <div className="uc-row">
            <dt>地区</dt>
            <dd>{country}</dd>
          </div>
        )}
        {onlineFor && (
          <div className="uc-row">
            <dt>在线时长</dt>
            <dd>{onlineFor}</dd>
          </div>
        )}
        {userTag && (
          <div className="uc-row">
            <dt>标签</dt>
            <dd className="uc-tag">{userTag}</dd>
          </div>
        )}
        {description && (
          <div className="uc-row">
            <dt>描述</dt>
            <dd className="uc-desc">{description}</dd>
          </div>
        )}
        {!me && (
          <div className="uc-row uc-vol">
            <dt>音量</dt>
            <dd>
              <Slider
                className="uc-vol-range"
                min={0}
                max={200}
                step={5}
                value={pct}
                onChange={(value) => onVolume?.(Number(value) / 100)}
                aria-label="个人音量"
              />
              <span className="uc-vol-pct">{pct}%</span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
