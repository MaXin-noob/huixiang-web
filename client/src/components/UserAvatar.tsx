import { useEffect, useState, type CSSProperties } from 'react';
import { avatarColor, initial } from '../ui';

interface Props {
  name: string;
  /** 按顺序尝试的图片地址；全失败时留首字母。 */
  sources?: string[];
  /** 颜色按 uid 固定，别每帧换脸。 */
  colorKey: string | number;
  className?: string;
  style?: CSSProperties;
  /** 给读屏软件的名字；不传就当作装饰图。 */
  label?: string;
  /** 正在直播：外面套一层粉色流光圆环 + 顶部「直播」渐变角标。 */
  live?: boolean;
  /** 直播头像的像素边长（不传默认 40）。 */
  size?: number;
}

/**
 * 一个圆形头像：图片加载失败会依次换下一个地址，最后退回首字母。
 * 顺序由调用方决定（账号头像 > 服务器头像 > myTeamSpeak 头像），和安卓端一致。
 */
export default function UserAvatar({ name, sources = [], colorKey, className = 'msg-avatar', style, label, live = false, size }: Props) {
  const key = sources.join('|');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [key]);

  const src = sources[index];

  const inner = (
    <span
      className={className}
      style={{ background: avatarColor(colorKey), ...(live && size ? { width: size, height: size } : null), ...style }}
      aria-hidden={label ? undefined : true}
      title={label}
    >
      {initial(name)}
      {src && (
        <img
          src={src}
          alt={label ?? ''}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIndex((i) => i + 1)}
        />
      )}
    </span>
  );

  if (!live) return inner;

  const px = size ?? 40;
  return (
    <span className="uc-live-avatar-wrap" style={{ width: px, height: px }}>
      {inner}
      <span className="uc-live-ring" aria-hidden />
      <span className="uc-live-tag">直播</span>
    </span>
  );
}
