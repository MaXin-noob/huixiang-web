// AudioContext 构造器的统一入口：标准名优先，老 Safari 只认 webkit 前缀。
//
// 这里集中处理两件事，免得每个音频文件各写一遍 `(globalThis as any)`：
// 1. 类型安全地取用可能不存在的构造器（不存在的分支交给调用方判空）；
// 2. 用 record 索引代替 any，保持 ESLint 干净。

const GLOBAL = globalThis as Record<string, unknown>;

/** 可用的 AudioContext 构造器；浏览器不支持时为 undefined。 */
export const AudioContextCtor: typeof AudioContext | undefined =
  typeof AudioContext !== 'undefined'
    ? AudioContext
    : (GLOBAL.webkitAudioContext as typeof AudioContext | undefined);

/**
 * 建一个 AudioContext。不支持 Web Audio 的浏览器直接抛错，
 * 由调用方（MicSender.start / VoicePlayer 构造）用 try/catch 兜成「语音不可用」。
 */
export function createAudioContext(init?: AudioContextOptions): AudioContext {
  const Ctor = AudioContextCtor;
  if (!Ctor) throw new Error('当前浏览器不支持 Web Audio');
  return new Ctor(init);
}
