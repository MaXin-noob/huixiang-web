import { useEffect, useRef } from 'react';

/**
 * 登录页右侧的四个小家伙。
 *
 * 平时眼珠跟着鼠标跑；一旦你往密码 / 服务器口令里输入，它们就齐刷刷把眼睛
 * 眯成一条缝、身子往旁边转过去 —— 就是「捂眼」那套防偷看的意思。
 * 纯 DOM + CSS，没有图片也没有动画库，跟着指针用 rAF 每帧挪一下眼珠。
 */

interface Blob {
  id: string;
  color: string;
  /** 眼睛相对身体的比例，小的角色眼睛也小一点 */
  eye: number;
  left: string;
  top: string;
  size: number;
  tilt: number;
  /** 出场所需的最小视口宽度；不填表示一直显示 */
  minWidth?: number;
}

// 前四个常驻；后四个是给大屏补位的，窗口够宽才出场（CSS 里按 nth-child 控制显隐）
const BLOBS: Blob[] = [
  { id: 'violet', color: '#6c4bf6', size: 146, eye: 0.3, left: '38%', top: '9%', tilt: 5 },
  { id: 'green', color: '#1f7a3e', size: 116, eye: 0.31, left: '6%', top: '29%', tilt: -6 },
  { id: 'amber', color: '#e08a1e', size: 102, eye: 0.3, left: '71%', top: '33%', tilt: -4 },
  { id: 'ink', color: '#1f2328', size: 124, eye: 0.29, left: '26%', top: '57%', tilt: 3 },
  { id: 'plum', color: '#8b6ff8', size: 96, eye: 0.3, left: '57%', top: '62%', tilt: 6, minWidth: 1600 },
  { id: 'moss', color: '#2f9e57', size: 88, eye: 0.31, left: '8%', top: '72%', tilt: -5, minWidth: 1900 },
  { id: 'clay', color: '#f0a94b', size: 84, eye: 0.3, left: '69%', top: '78%', tilt: 4, minWidth: 2200 },
  { id: 'slate', color: '#3b414c', size: 92, eye: 0.29, left: '30%', top: '84%', tilt: -3, minWidth: 2500 },
];

/** 眼珠最多能偏出去多少像素，跟参考项目里 data-max-distance 一个意思 */
const MAX_TRAVEL = 5;

export default function PeekGuard({ guard }: { guard: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pupils = useRef<(HTMLSpanElement | null)[]>([]);
  const pointer = useRef({ x: 0, y: 0, seen: false });
  const frame = useRef(0);

  // 指针位置先记在 ref 里，真正的写入放到下一个 rAF，避免一次移动触发一堆布局读取
  useEffect(() => {
    const paint = () => {
      frame.current = 0;
      const hiding = rootRef.current?.dataset.guard === '1';
      const { x, y, seen } = pointer.current;
      for (const pupil of pupils.current) {
        if (!pupil) continue;
        const eye = pupil.parentElement;
        if (!eye) continue;
        if (hiding || !seen) {
          // 捂眼时眼珠缩回左上角，配合 CSS 里眯起来的眼缝
          pupil.style.transform = 'translate(-3px, -4px)';
          continue;
        }
        // 大屏才出场的角色在窄窗口下是 display:none，没必要每帧量它
        if (!eye.getClientRects().length) continue;
        const rect = eye.getBoundingClientRect();
        const dx = x - (rect.left + rect.width / 2);
        const dy = y - (rect.top + rect.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        // 离得越远往边上看，但超过一定距离就不再增加位移
        const pull = Math.min(1, distance / 260);
        const ox = (dx / distance) * MAX_TRAVEL * pull;
        const oy = (dy / distance) * MAX_TRAVEL * pull;
        pupil.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`;
      }
    };

    const schedule = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(paint);
    };

    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY, seen: true };
      schedule();
    };

    pointer.current = { x: window.innerWidth / 2, y: 0, seen: true };
    schedule();

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  // 进出捂眼状态时不会再有 pointermove，得主动重画一次
  useEffect(() => {
    if (!rootRef.current) return;
    rootRef.current.dataset.guard = guard ? '1' : '0';
    for (const pupil of pupils.current) {
      if (pupil) pupil.style.transform = guard ? 'translate(-3px, -4px)' : 'translate(0, 0)';
    }
  }, [guard]);

  return (
    <div ref={rootRef} className={`peek-guard${guard ? ' is-hiding' : ''}`} data-guard={guard ? '1' : '0'}>
      {BLOBS.map((blob, index) => {
        const eye = Math.round(blob.size * blob.eye);
        return (
          <div
            key={blob.id}
            className={`peek-blob${blob.minWidth ? ' peek-blob--extra' : ''}`}
            data-min-width={blob.minWidth ?? undefined}
            style={{
              // 尺寸走 CSS 变量 + --peek-scale，大屏时整体跟着放大一点
              ['--blob-w' as string]: `${blob.size}px`,
              width: 'calc(var(--blob-w) * var(--peek-scale))',
              height: 'calc(var(--blob-w) * 0.92 * var(--peek-scale))',
              left: blob.left,
              top: blob.top,
              background: blob.color,
              borderRadius: 'calc(var(--blob-w) * 0.44 * var(--peek-scale))',
              // 把身体颜色也传下去，给「眼皮」那层用（眨眼时盖住眼珠）
              ['--blob-color' as string]: blob.color,
              // CSS 变量把倾斜角传下去，捂眼时整体再往外转一圈
              ['--blob-tilt' as string]: `${blob.tilt}deg`,
            }}
          >
            <div className="peek-eyes">
              {[0, 1].map((side) => (
                <span
                  key={side}
                  className="peek-eye"
                  style={{
                    ['--eye-w' as string]: `${eye}px`,
                    width: 'calc(var(--eye-w) * var(--peek-scale))',
                    height: 'calc(var(--eye-w) * var(--peek-scale))',
                  }}
                >
                  <span
                    ref={(node) => {
                      pupils.current[index * 2 + side] = node;
                    }}
                    className="peek-pupil"
                    style={{
                      width: 'calc(var(--eye-w) * 0.42 * var(--peek-scale))',
                      height: 'calc(var(--eye-w) * 0.42 * var(--peek-scale))',
                    }}
                  />
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
