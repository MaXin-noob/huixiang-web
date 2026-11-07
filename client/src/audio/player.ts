// 下行语音：网关送来的是裸 Opus 帧，浏览器 WebCodecs 解码，Web Audio 排程播放。
// 每个人一个解码器和一个播放队列——TS 的语音包是先解压再混的，混在一起解会把时间戳搞乱。

import { DEFAULT_GAIN, clampGain } from './gain';
import { createAudioContext } from './context';

// WebCodecs 在 lib.dom 里已有类型声明，但运行时不一定存在（旧版 Safari、非安全上下文等），
// 所以按「可能缺失的构造器」取用，由 webCodecsAvailable() 和 play() 里的守卫兜住。
const AudioDecoderCtor: typeof AudioDecoder | undefined = (
  globalThis as Record<string, unknown>
).AudioDecoder as typeof AudioDecoder | undefined;
const EncodedAudioChunkCtor: typeof EncodedAudioChunk | undefined = (
  globalThis as Record<string, unknown>
).EncodedAudioChunk as typeof EncodedAudioChunk | undefined;

/** OpusHead（19 字节）：WebCodecs 的 opus 解码器要这个 description 才肯工作。 */
const OPUS_HEAD = new Uint8Array([
  0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, // "OpusHead"
  1, // version
  2, // channel count
  0, 0, // pre-skip
  0x80, 0xbb, 0, 0, // 48000 little-endian
  0, 0, // output gain
  0, // mapping family
]);

export const webCodecsAvailable = () => !!AudioDecoderCtor && !!EncodedAudioChunkCtor;

interface Person {
  decoder: AudioDecoder;
  gain: GainNode;
  /** 下一次该在什么时候播（AudioContext 时间轴）。 */
  next: number;
  /** 解码时间戳，必须单调递增。 */
  ts: number;
  codec: number;
  frames: number;
}

export class VoicePlayer {
  private ctx: AudioContext;
  private master: GainNode;
  private people = new Map<number, Person>();
  private volumes = new Map<number, number>();
  private broken = false;
  /** 扬声器总音量（0–2），静音时临时归零，取消静音后回到这个值。 */
  private outputVolume = 1;
  private muted = false;

  constructor(private readonly onLevel?: (clientId: number, level: number) => void) {
    this.ctx = createAudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
  }

  /** 浏览器要求用户操作后才能出声。 */
  resume() {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.master.gain.value = muted ? 0 : this.outputVolume;
  }

  /** 扬声器总音量；静音状态下只记值，不覆盖静音。 */
  setOutputVolume(volume: number) {
    this.outputVolume = clampGain(volume);
    if (!this.muted) this.master.gain.value = this.outputVolume;
  }

  setVolume(clientId: number, volume: number) {
    const v = clampGain(volume);
    const prev = this.volumes.get(clientId);
    this.volumes.set(clientId, v);
    const p = this.people.get(clientId);
    // 值没变就别再排一次斜坡：名单同步是跟着 state 刷的，会一直调到这儿
    if (p && prev !== v) p.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /**
   * 把整个名单的音量一次性对齐：新人补上、改过的生效、已经不在名单里的收掉。
   * clientId 在同一个会话里可能被后来者复用，不清就会把上一个人的音量带给下一个人。
   */
  syncVolumes(entries: Array<{ id: number; volume: number }>) {
    const keep = new Set<number>();
    for (const { id, volume } of entries) {
      keep.add(id);
      this.setVolume(id, volume);
    }
    for (const id of [...this.people.keys()]) {
      if (!keep.has(id)) this.forget(id);
    }
    for (const id of [...this.volumes.keys()]) {
      if (!keep.has(id)) this.volumes.delete(id);
    }
  }

  /** 一帧 Opus。空帧表示这个人停止说话了。 */
  play(clientId: number, codec: number, opus: Uint8Array) {
    if (this.broken) return;
    // 浏览器可能因为自动播放策略一直把 AudioContext 挂在 suspended：出声前先尝试恢复，
    // 否则要等用户随手拖一下音量（触发手势）才听得到别人说话。
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (opus.length === 0) return;
    const Chunk = EncodedAudioChunkCtor;
    if (!Chunk || !AudioDecoderCtor) return;

    const p = this.person(clientId, codec);
    if (!p) return;

    try {
      p.decoder.decode(
        new Chunk({
          type: 'key',
          timestamp: p.ts,
          duration: 20000,
          data: opus,
        }),
      );
      p.ts += 20000;
      p.frames++;
    } catch {
      // 解码器坏了就重建，下一帧还能接上
      this.dispose(clientId);
    }
  }

  private person(clientId: number, codec: number): Person | null {
    const existing = this.people.get(clientId);
    if (existing) {
      if (existing.codec !== codec) {
        // 频道换了编码（Voice ↔ Music），重开一个
        this.dispose(clientId);
      } else {
        return existing;
      }
    }

    const gain = this.ctx.createGain();
    gain.gain.value = this.volumes.get(clientId) ?? DEFAULT_GAIN;
    gain.connect(this.master);

    const Decoder = AudioDecoderCtor;
    if (!Decoder) return null;

    let decoder: AudioDecoder;
    try {
      decoder = new Decoder({
        output: (data: AudioData) => this.render(data, clientId),
        error: () => this.dispose(clientId),
      });
      decoder.configure({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
        description: OPUS_HEAD,
      });
    } catch {
      this.broken = true;
      return null;
    }

    const p: Person = { decoder, gain, next: 0, ts: 0, codec, frames: 0 };
    this.people.set(clientId, p);
    return p;
  }

  /** 解码好了：拷成 AudioBuffer，按时间排在上一帧后面。 */
  private render(data: AudioData, clientId: number) {
    const p = this.people.get(clientId);
    if (!p) {
      data.close();
      return;
    }
    try {
      const frames = data.numberOfFrames;
      const channels = data.numberOfChannels;
      const rate = data.sampleRate;
      const buffer = this.ctx.createBuffer(channels, frames, rate);
      let peak = 0;
      for (let c = 0; c < channels; c++) {
        const plane = new Float32Array(frames);
        data.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
        if (c === 0) {
          for (let i = 0; i < frames; i += 16) {
            const v = Math.abs(plane[i]);
            if (v > peak) peak = v;
          }
        }
        buffer.copyToChannel(plane, c);
      }
      this.onLevel?.(clientId, peak);

      const now = this.ctx.currentTime;
      // 留 30ms 余量给排程；落后太多说明卡了，直接重新对齐，别把延迟越积越大
      let when = Math.max(now + 0.03, p.next);
      if (when - now > 0.4) when = now + 0.05;

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(p.gain);
      src.start(when);
      p.next = when + frames / rate;
    } catch {
      // 单帧失败不影响后面的
    } finally {
      data.close();
    }
  }

  private dispose(clientId: number) {
    const p = this.people.get(clientId);
    if (!p) return;
    try {
      p.decoder.close();
    } catch {
      // 已经关了
    }
    try {
      p.gain.disconnect();
    } catch {
      // 已经断了
    }
    this.people.delete(clientId);
  }

  /** 有人离开服务器：把他的解码器和音量节点一起收掉。 */
  forget(clientId: number) {
    this.dispose(clientId);
    this.volumes.delete(clientId);
  }

  close() {
    for (const id of [...this.people.keys()]) this.dispose(id);
    void this.ctx.close();
  }
}
