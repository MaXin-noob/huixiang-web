import type { Member, PersonDetails } from '../protocol';
import { avatarSources } from '../ui';
import UserAvatar from './UserAvatar';

interface Props {
  member: Member;
  /** 这个人所在频道名（舞台里就是当前频道）。 */
  channelName: string;
  ownId: number;
  accountAvatar: string;
  avatarToken: string;
  /** 服务器补问回来的公开字段（保留参数，卡片暂不展示）。 */
  details?: PersonDetails;
  /** 个人音量（0–2，0 = 单独静音），缺省 1。 */
  volume?: number;
  onVolume?: (v: number) => void;
}

/**
 * 用户资料卡：悬停在成员上时浮出来的一张小卡片。
 * 只显示「频道、身份组、音量」三项；音量按 uid 记，0 = 单独静音这个人。
 */
export default function UserCard({
  member,
  channelName,
  ownId,
  accountAvatar,
  avatarToken,
  volume = 1,
  onVolume,
}: Props) {
  const me = member.id === ownId;
  const groups = [member.channelGroup, ...member.serverGroups].filter((g) => !!g && g.trim().length > 0);
  const pct = Math.round(Math.min(2, Math.max(0, volume)) * 100);

  return (
    <div className="user-card">
      <div className="user-card-head">
        <UserAvatar
          name={member.nickname}
          sources={avatarSources(member, ownId, accountAvatar, avatarToken)}
          colorKey={me ? 'me' : member.uid || member.id}
          className="user-card-avatar"
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
            {member.streaming && <span className="uc-badge uc-live">直播中</span>}
            {member.inputMuted && <span className="uc-badge uc-mute">麦克风静音</span>}
            {!member.inputMuted && member.outputMuted && <span className="uc-badge uc-mute">扬声器静音</span>}
            {member.priority && <span className="uc-badge uc-priority">优先发言人</span>}
          </div>
        </div>
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
        {!me && (
          <div className="uc-row uc-vol">
            <dt>音量</dt>
            <dd>
              <input
                className="uc-vol-range"
                type="range"
                min={0}
                max={200}
                step={5}
                value={pct}
                onChange={(e) => onVolume?.(Number(e.target.value) / 100)}
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
