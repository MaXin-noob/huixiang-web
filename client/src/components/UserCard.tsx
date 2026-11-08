import { Button, Slider } from '@douyinfe/semi-ui';
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
  /** 戳一戳这个人（右上角按钮）；不传则不显示，自己的卡片也不显示。 */
  onPoke?: () => void;
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
  onPoke,
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
          live={member.streaming}
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
            {member.streaming && <span className="uc-badge uc-live">直播中</span>}
            {member.inputMuted && <span className="uc-badge uc-mute">麦克风静音</span>}
            {!member.inputMuted && member.outputMuted && <span className="uc-badge uc-mute">扬声器静音</span>}
            {member.priority && <span className="uc-badge uc-priority">优先发言人</span>}
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
