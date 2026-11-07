import type { ReactNode } from 'react';
import { Popover, Slider } from '@douyinfe/semi-ui';
import { clampGain, gainPercent } from '../audio/gain';

interface Props {
  /** 无障碍名称（不再在弹层里显示标题文字）。 */
  title: string;
  /** 0–2 的增益。 */
  value: number;
  onChange: (v: number) => void;
  /** 兼容旧调用方，已不再展示提示文案。 */
  zeroHint?: string;
  /** 触发方式，默认点击。 */
  trigger?: 'click' | 'hover';
  children: ReactNode;
}

/**
 * 音量弹层：只保留一根滑块，不显示标题 / 百分比 / 提示 / 复原，
 * 并去掉弹层自带的白底卡片、内边距、描边和阴影——整个控件就是滑块本身大小。
 * 0 = 听不到，100% = 原始电平，200% = +6dB。
 */
export default function VolumePopover({ title, value, onChange, trigger = 'click', children }: Props) {
  const pct = gainPercent(value);

  return (
    <Popover
      trigger={trigger}
      position="top"
      showArrow={false}
      style={{ padding: 0, background: 'transparent', boxShadow: 'none', border: 'none' }}
      content={
        <div className="vol-pop">
          <Slider
            className="vol-slider"
            value={pct}
            min={0}
            max={200}
            step={5}
            aria-label={title}
            tooltipFormatter={(v: number | string) => `${v}%`}
            onChange={(v) => onChange(clampGain(Number(v) / 100))}
          />
        </div>
      }
    >
      {children}
    </Popover>
  );
}
