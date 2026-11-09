/**
 * 一段延迟的统计结果：均值（ms）与标准差（ms）。
 *
 * 对齐 TeamSpeak 官方客户端：
 * - `CONNECTION_PING`           = 过去 5 秒的平均往返延迟
 * - `CONNECTION_PING_DEVIATION` = 这些测量值的标准差（界面上的 `±`）
 */
export type PingSample = { mean: number; std: number };

/**
 * 滑动时间窗口的 ping 统计。
 *
 * 只保留最近 `windowMs` 内的样本（默认 5000ms，和官方一致），
 * 用窗口内样本算平均值与总体标准差。每秒一帧探针时窗口里约 5 个点。
 */
export class PingWindow {
  private readonly windowMs: number;
  private samples: { t: number; v: number }[] = [];

  constructor(windowMs = 5000) {
    this.windowMs = windowMs;
  }

  /** 记一个样本，返回更新后窗口的统计。 */
  add(value: number): PingSample {
    const now = performance.now();
    this.samples.push({ t: now, v: value });
    const cutoff = now - this.windowMs;
    // 按时间顺序入队，从头部丢掉过期的（5 秒窗口，样本很少，shift 足够）
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
    return this.compute();
  }

  /** 只读当前窗口统计；空窗口返回 null。 */
  snapshot(): PingSample | null {
    return this.samples.length ? this.compute() : null;
  }

  reset() {
    this.samples = [];
  }

  private compute(): PingSample {
    const n = this.samples.length;
    let sum = 0;
    for (const s of this.samples) sum += s.v;
    const mean = sum / n;
    let sq = 0;
    for (const s of this.samples) sq += (s.v - mean) ** 2;
    // 总体标准差（除以 n），和 ping 的 mdev / 官方 deviation 口径一致
    return { mean, std: Math.sqrt(sq / n) };
  }
}
