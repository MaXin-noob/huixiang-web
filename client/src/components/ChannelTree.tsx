import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { Dropdown } from '@douyinfe/semi-ui';
import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconDelete,
  IconEdit,
  IconLock,
  IconMicrophoneOff,
  IconMore,
  IconPlus,
  IconVolumnSilent,
} from '@douyinfe/semi-icons';
import { findChannel } from '../protocol';
import type { ChannelNode, Member } from '../protocol';
import ChannelIcon from './ChannelIcon';

interface Props {
  tree: ChannelNode[];
  ownChannel: number;
  /** 正在切换的目标频道：置灰 + 禁止重复点 */
  joiningChannel: number | null;
  onJoin: (channel: ChannelNode) => void;
  /** 频道管理：建子频道 / 编辑 / 删除 */
  onCreateChannel: (parent: number) => void;
  onEditChannel: (channel: ChannelNode) => void;
  onDeleteChannel: (channel: ChannelNode) => void;
  /**
   * 频道排序：在同级里上移 / 下移（after = 排在其后的频道 id，0 表示最前）。
   * 拖拽跨父级时额外带 parent（新父级 id），网关会发 channelmove。
   */
  onReorderChannel: (channel: ChannelNode, after: number, parent?: number) => void;
  /** 头像令牌：频道图标地址里带它（<img> 不能带 header）。 */
  avatarToken?: string;
  /** 成员管理（可选）：别的频道里的人也能踢 / 封 */
  onKick?: (member: Member) => void;
  onBan?: (member: Member) => void;
}

interface Row {
  channel: ChannelNode;
  depth: number;
}

/** 按折叠状态摊平成要渲染的行。父频道折起来时，整棵子树都不出。 */
function walk(list: ChannelNode[], depth: number, collapsed: Set<number>, out: Row[]) {
  for (const channel of list) {
    out.push({ channel, depth });
    if (channel.children.length > 0 && !collapsed.has(channel.id)) {
      walk(channel.children, depth + 1, collapsed, out);
    }
  }
  return out;
}

/** 别人频道里的成员：只在这里露一行。当前频道的人交给舞台，不重复画。 */
function PersonRow({
  member,
  onKick,
  onBan,
  token,
}: {
  member: Member;
  token?: string;
  onKick?: (m: Member) => void;
  onBan?: (m: Member) => void;
}) {
  const row = (
    <div className={`person${member.talking ? ' person-talking' : ''}`}>
      <span className="person-dot" />
      <span className="person-name" title={member.nickname}>
        {member.nickname}
      </span>
      {member.badges && member.badges.length > 0 && (
        <span className="person-badges">
          {member.badges.map((id) => (
            <ChannelIcon key={id} iconId={id} token={token} silent />
          ))}
        </span>
      )}
      <span className="person-marks">
        {member.priority && (
          <span className="mark mark-priority" title="优先发言人">
            P
          </span>
        )}
        {member.away && (
          <span className="mark mark-away" title="离开">
            离
          </span>
        )}
        {member.streaming && (
          <span className="mark mark-stream" title="正在共享画面">
            屏
          </span>
        )}
        {member.inputMuted && <IconMicrophoneOff size="small" />}
        {member.outputMuted && <IconVolumnSilent size="small" />}
      </span>
    </div>
  );
  if (!onKick && !onBan) return row;
  return (
    <Dropdown
      trigger="contextMenu"
      position="rightTop"
      clickToHide
      menu={[
        ...(onKick ? [{ node: 'item' as const, name: '踢出成员', onClick: () => onKick(member) }] : []),
        ...(onBan
          ? [{ node: 'item' as const, name: '封禁成员', type: 'danger' as const, onClick: () => onBan(member) }]
          : []),
      ]}
    >
      {row}
    </Dropdown>
  );
}

export default function ChannelTree({
  tree,
  ownChannel,
  joiningChannel,
  onJoin,
  onCreateChannel,
  onEditChannel,
  onDeleteChannel,
  onReorderChannel,
  avatarToken,
  onKick,
  onBan,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const rows = useMemo(() => walk(tree, 0, collapsed, []), [tree, collapsed]);

  // 拖拽排序：dragId 是正在拖的频道，dropHint 是当前高亮的插入位置。
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<{ id: number; pos: 'before' | 'after' } | null>(null);

  const toggle = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 某频道的同级兄弟（顶层父级为 0，直接取整棵树）。 */
  const siblingsOf = (channel: ChannelNode): ChannelNode[] =>
    channel.parent ? (findChannel(tree, channel.parent)?.children ?? []) : tree;

  /** [id] 是否在 [root] 的子树里（含更深的层级）。 */
  const inSubtree = (root: ChannelNode, id: number): boolean =>
    root.children.some((c) => c.id === id || inSubtree(c, id));

  /** 能否把 source 放到 target 上：不能放到自己，也不能拖进自己的子频道（否则成环）。 */
  const canDropOn = (source: ChannelNode, target: ChannelNode): boolean =>
    source.id !== target.id && !inSubtree(source, target.id);

  /**
   * 把 source 放到 target 的前 / 后。同级即重新排序；跨父级时把 source 移到 target 的父级并插到该位置
   * （网关用 channelmove 处理）。after = 新位置上排在其前的频道 id，0 表示最前。
   */
  const dropOn = (source: ChannelNode, target: ChannelNode, pos: 'before' | 'after') => {
    if (!canDropOn(source, target)) return;
    const parent = target.parent;
    const sibs = siblingsOf(target);
    const without = sibs.filter((c) => c.id !== source.id);
    const ti = without.findIndex((c) => c.id === target.id);
    if (ti < 0) return;
    const k = pos === 'before' ? ti : ti + 1;
    const next = [...without.slice(0, k), source, ...without.slice(k)];
    // 落点和原来一样就别打扰服务器（仅同父级时可能出现）。
    if (sibs.length === next.length && next.every((c, i) => c.id === sibs[i].id)) return;
    const after = k === 0 ? 0 : without[k - 1].id;
    onReorderChannel(source, after, parent !== source.parent ? parent : undefined);
  };

  const startDrag = (channel: ChannelNode) => (e: DragEvent<HTMLDivElement>) => {
    setDragId(channel.id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox 不设 data 就不会触发拖拽。
    e.dataTransfer.setData('text/plain', String(channel.id));
  };

  const endDrag = () => {
    setDragId(null);
    setDropHint(null);
  };

  const overRow = (channel: ChannelNode) => (e: DragEvent<HTMLDivElement>) => {
    const src = dragId != null ? findChannel(tree, dragId) : null;
    if (!src || !canDropOn(src, channel)) return; // 不 preventDefault，光标显示不可放置
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const pos: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropHint((prev) => (prev && prev.id === channel.id && prev.pos === pos ? prev : { id: channel.id, pos }));
  };

  const leaveRow = (channel: ChannelNode) => (e: DragEvent<HTMLDivElement>) => {
    // 指针移进子元素也会触发 dragleave，真正离开这一块时才清。
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropHint((prev) => (prev && prev.id === channel.id ? null : prev));
  };

  const dropRow = (channel: ChannelNode) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const src = dragId != null ? findChannel(tree, dragId) : null;
    const pos = dropHint?.id === channel.id ? dropHint.pos : null;
    endDrag();
    if (!src || !pos) return;
    dropOn(src, channel, pos);
  };

  /** 包装一行的拖拽落点属性（拖起放在行本身上，落点放在整块容器上）。 */
  const dropProps = (channel: ChannelNode) => ({
    onDragOver: overRow(channel),
    onDragLeave: leaveRow(channel),
    onDrop: dropRow(channel),
  });

  const rowClass = (channel: ChannelNode) => {
    const pos = dropHint?.id === channel.id ? dropHint.pos : null;
    return `rail-chan${dragId === channel.id ? ' is-dragging' : ''}${pos ? ` drop-${pos}` : ''}`;
  };

  const menuFor = (channel: ChannelNode) => {
    // 同级兄弟按当前显示顺序排列；parent 为 0 表示顶层，直接取整棵树。
    const siblings = channel.parent ? (findChannel(tree, channel.parent)?.children ?? tree) : tree;
    const idx = siblings.findIndex((c) => c.id === channel.id);
    const canUp = idx > 0;
    const canDown = idx >= 0 && idx < siblings.length - 1;
    return [
      {
        node: 'item' as const,
        name: '上移',
        icon: <IconChevronUp size="small" />,
        disabled: !canUp,
        onClick: () => onReorderChannel(channel, idx - 1 <= 0 ? 0 : siblings[idx - 2].id),
      },
      {
        node: 'item' as const,
        name: '下移',
        icon: <IconChevronDown size="small" />,
        disabled: !canDown,
        onClick: () => onReorderChannel(channel, siblings[idx + 1].id),
      },
      { node: 'divider' as const },
      {
        node: 'item' as const,
        name: '新建子频道',
        icon: <IconPlus size="small" />,
        onClick: () => onCreateChannel(channel.id),
      },
      {
        node: 'item' as const,
        name: '编辑频道',
        icon: <IconEdit size="small" />,
        onClick: () => onEditChannel(channel),
      },
      {
        node: 'item' as const,
        name: '删除频道',
        icon: <IconDelete size="small" />,
        type: 'danger' as const,
        onClick: () => onDeleteChannel(channel),
      },
    ];
  };

  if (rows.length === 0) {
    return <div className="rail-body">这个服务器还没有频道</div>;
  }

  return (
    <div className="rail-body">
      {rows.map(({ channel, depth }) => {
        // 分隔符频道：TeamSpeak 用它画横线或居中标题，不能点进去
        if (channel.spacer) {
          return (
            <div className={rowClass(channel)} key={channel.id} {...dropProps(channel)}>
              <div
                className="chan-spacer"
                style={{ paddingLeft: 8 + depth * 12 }}
                draggable
                onDragStart={startDrag(channel)}
                onDragEnd={endDrag}
              >
                {channel.display ? (
                  <span className="chan-spacer-text">{channel.display}</span>
                ) : (
                  <span className="chan-spacer-line" />
                )}
              </div>
            </div>
          );
        }

        const here = channel.id === ownChannel;
        const hasChildren = channel.children.length > 0;
        const open = !collapsed.has(channel.id);
        const joining = joiningChannel === channel.id;
        const people = channel.clients;

        const rowNode = (
          <div
            className={`chan-row${here ? ' chan-on' : ''}`}
            style={{ paddingLeft: 8 + depth * 12 }}
            role="button"
            tabIndex={0}
            draggable
            onDragStart={startDrag(channel)}
            onDragEnd={endDrag}
            aria-current={here ? 'true' : undefined}
            aria-disabled={joining || undefined}
            onClick={() => {
              if (joining) return;
              onJoin(channel);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!joining) onJoin(channel);
              }
            }}
          >
            {hasChildren ? (
              <span
                className="chan-caret"
                role="presentation"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(channel.id);
                }}
              >
                {open ? <IconChevronDown size="small" /> : <IconChevronRight size="small" />}
              </span>
            ) : (
              <span className="chan-caret-space" />
            )}
            <span className="chan-icon">
              <ChannelIcon iconId={channel.iconId} token={avatarToken} />
            </span>
            <span className="chan-name" title={channel.topic || channel.display}>
              {channel.display || channel.name}
            </span>
            {channel.password && <IconLock size="small" className="chan-lock" />}
            {people.length > 0 && <span className="chan-count">{people.length}</span>}
            <span className="chan-more" onClick={(e) => e.stopPropagation()}>
              <Dropdown
                trigger="click"
                position="rightTop"
                clickToHide
                menu={menuFor(channel)}
              >
                <button type="button" className="chan-more-btn" aria-label="频道操作">
                  <IconMore size="small" />
                </button>
              </Dropdown>
            </span>
          </div>
        );

        return (
          <div key={channel.id} className={rowClass(channel)} {...dropProps(channel)}>
            <Dropdown
              trigger="contextMenu"
              position="rightTop"
              clickToHide
              menu={menuFor(channel)}
            >
              {rowNode}
            </Dropdown>

            {people.length > 0 && !here && (
              <div className="chan-people" style={{ paddingLeft: 8 + depth * 12 + 22 }}>
                {people.map((m) => (
                  <PersonRow key={m.id} member={m} token={avatarToken} onKick={onKick} onBan={onBan} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
