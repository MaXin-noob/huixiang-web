// 频道进出的轻提示：改用 Semi Notification 展示，队列仍由 App 负责。
import { useEffect, useRef } from 'react';
import { Notification } from '@douyinfe/semi-ui';

export interface PresenceNotice {
  id: number;
  text: string;
  kind: 'join' | 'leave';
}

export default function PresenceToasts({ items }: { items: PresenceNotice[] }) {
  const shown = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const it of items) {
      if (shown.current.has(it.id)) continue;
      shown.current.add(it.id);
      Notification.open({
        content: (
          <span className="presence-line">
            <span className={`presence-dot presence-${it.kind}`} aria-hidden="true" />
            <span className="presence-text">{it.text}</span>
          </span>
        ),
        duration: 3,
        position: 'bottomRight',
        theme: 'normal',
        showClose: false,
        className: 'presence-notification',
      });
    }
    for (const id of Array.from(shown.current)) {
      if (!items.some((it) => it.id === id)) shown.current.delete(id);
    }
  }, [items]);

  return null;
}
