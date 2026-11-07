/**
 * 聊天表情：短码表（:name: → emoji）与选择器数据。
 *
 * 对齐 TeamSpeak 桌面端的用法：输入 `:blush:`、`:relaxed:` 这类短码，发送时
 * 转成真正的 emoji 字符；收到的消息在渲染时也做一次同样的转换，这样别人发来的
 * 短码也能正常显示成表情。
 */

/** 有序的短码列表：选择器按这个顺序展示，同时用于生成短码表。 */
const EMOJI_TABLE: ReadonlyArray<readonly [name: string, char: string]> = [
  // 表情 · 笑脸
  ['smile', '😄'],
  ['smiley', '😃'],
  ['grin', '😁'],
  ['laughing', '😆'],
  ['joy', '😂'],
  ['rofl', '🤣'],
  ['sweat_smile', '😅'],
  ['blush', '😊'],
  ['relaxed', '☺️'],
  ['wink', '😉'],
  ['kissing_heart', '😘'],
  ['heart_eyes', '😍'],
  ['yum', '😋'],
  ['stuck_out_tongue', '😛'],
  ['zany_face', '🤪'],
  ['thinking', '🤔'],
  ['neutral_face', '😐'],
  ['smirk', '😏'],
  ['unamused', '😒'],
  ['roll_eyes', '🙄'],
  ['pensive', '😔'],
  ['sleepy', '😪'],
  ['sob', '😭'],
  ['cry', '😢'],
  ['scream', '😱'],
  ['angry', '😠'],
  ['rage', '😡'],
  ['flushed', '😳'],
  ['sunglasses', '😎'],
  ['nerd_face', '🤓'],
  ['mask', '😷'],
  ['sleeping', '😴'],
  ['drooling_face', '🤤'],
  ['shush', '🤫'],
  ['sick', '🤢'],
  ['hot_face', '🥵'],
  ['cold_face', '🥶'],
  ['partying_face', '🥳'],
  ['star_struck', '🤩'],
  ['exploding_head', '🤯'],
  ['pleading_face', '🥺'],
  // 手势
  ['thumbsup', '👍'],
  ['thumbsdown', '👎'],
  ['ok_hand', '👌'],
  ['clap', '👏'],
  ['wave', '👋'],
  ['pray', '🙏'],
  ['muscle', '💪'],
  ['point_up', '☝️'],
  ['point_down', '👇'],
  ['point_left', '👈'],
  ['point_right', '👉'],
  ['raised_hand', '✋'],
  ['raised_hands', '🙌'],
  ['handshake', '🤝'],
  ['v', '✌️'],
  ['crossed_fingers', '🤞'],
  ['love_you', '🤟'],
  ['call_me', '🤙'],
  ['writing_hand', '✍️'],
  ['nail_care', '💅'],
  // 爱心 · 符号
  ['heart', '❤️'],
  ['orange_heart', '🧡'],
  ['yellow_heart', '💛'],
  ['green_heart', '💚'],
  ['blue_heart', '💙'],
  ['purple_heart', '💜'],
  ['black_heart', '🖤'],
  ['broken_heart', '💔'],
  ['two_hearts', '💕'],
  ['sparkling_heart', '💖'],
  ['heartpulse', '💗'],
  ['fire', '🔥'],
  ['star', '⭐'],
  ['star2', '🌟'],
  ['sparkles', '✨'],
  ['zap', '⚡'],
  ['boom', '💥'],
  ['dizzy', '💫'],
  ['sweat_drops', '💦'],
  ['dash', '💨'],
  ['cloud', '☁️'],
  ['sunny', '☀️'],
  ['rainbow', '🌈'],
  ['moon', '🌙'],
  ['snowflake', '❄️'],
  ['umbrella', '☔'],
  // 动物
  ['dog', '🐶'],
  ['cat', '🐱'],
  ['mouse', '🐭'],
  ['rabbit', '🐰'],
  ['fox_face', '🦊'],
  ['bear', '🐻'],
  ['panda_face', '🐼'],
  ['koala', '🐨'],
  ['tiger', '🐯'],
  ['lion', '🦁'],
  ['cow', '🐮'],
  ['pig', '🐷'],
  ['frog', '🐸'],
  ['monkey_face', '🐵'],
  ['chicken', '🐔'],
  ['penguin', '🐧'],
  ['bird', '🐦'],
  ['unicorn', '🦄'],
  ['bee', '🐝'],
  ['bug', '🐛'],
  ['butterfly', '🦋'],
  ['snake', '🐍'],
  ['turtle', '🐢'],
  ['fish', '🐟'],
  ['whale', '🐳'],
  ['dolphin', '🐬'],
  // 食物
  ['apple', '🍎'],
  ['green_apple', '🍏'],
  ['orange', '🍊'],
  ['lemon', '🍋'],
  ['banana', '🍌'],
  ['watermelon', '🍉'],
  ['grapes', '🍇'],
  ['strawberry', '🍓'],
  ['peach', '🍑'],
  ['cherry', '🍒'],
  ['pineapple', '🍍'],
  ['pizza', '🍕'],
  ['hamburger', '🍔'],
  ['fries', '🍟'],
  ['taco', '🌮'],
  ['cake', '🍰'],
  ['cookie', '🍪'],
  ['coffee', '☕'],
  ['beer', '🍺'],
  ['wine', '🍷'],
  ['cocktail', '🍸'],
  ['milk', '🥛'],
  ['popcorn', '🍿'],
  // 物品 · 其他
  ['rocket', '🚀'],
  ['tada', '🎉'],
  ['gift', '🎁'],
  ['trophy', '🏆'],
  ['medal', '🏅'],
  ['soccer', '⚽'],
  ['basketball', '🏀'],
  ['computer', '💻'],
  ['phone', '📱'],
  ['bulb', '💡'],
  ['book', '📖'],
  ['pencil', '✏️'],
  ['memo', '📝'],
  ['white_check_mark', '✅'],
  ['x', '❌'],
  ['warning', '⚠️'],
  ['question', '❓'],
  ['exclamation', '❗'],
  ['100', '💯'],
  ['eyes', '👀'],
];

/** `:name:` → emoji 的短码表。 */
export const EMOJI_SHORTCODES: Record<string, string> = Object.fromEntries(EMOJI_TABLE);

/** 表情选择器的数据：按上表顺序，去重（同一 emoji 只保留首次出现的短码）。 */
export const EMOJI_LIST: ReadonlyArray<{ name: string; char: string }> = (() => {
  const seen = new Set<string>();
  const out: { name: string; char: string }[] = [];
  for (const [name, char] of EMOJI_TABLE) {
    if (seen.has(char)) continue;
    seen.add(char);
    out.push({ name, char });
  }
  return out;
})();

/** 把文本里的已登记短码（如 `:blush:`）替换成对应的 emoji；未知短码原样保留。 */
export function convertShortcodes(text: string): string {
  if (!text.includes(':')) return text;
  return text.replace(/:([a-zA-Z0-9_+-]+):/g, (whole, name: string) => {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(EMOJI_SHORTCODES, key) ? EMOJI_SHORTCODES[key] : whole;
  });
}

/** 匹配单个 emoji 字形（含变体选择符、肤色、ZWJ 组合）。 */
function emojiRegex(): RegExp {
  return /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
}

/** 是否「纯表情」消息：仅由 1~3 个 emoji（可含空白）组成 —— 用于大号渲染。 */
export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const matches = trimmed.match(emojiRegex()) ?? [];
  if (matches.length < 1 || matches.length > 3) return false;
  // 把匹配到的 emoji 依次剔除，剩下的只允许空白与变体/连接符（正常已被正则吃掉）。
  let rest = trimmed;
  for (const m of matches) {
    const idx = rest.indexOf(m);
    if (idx >= 0) rest = rest.slice(0, idx) + rest.slice(idx + m.length);
  }
  rest = rest.replace(/\s/gu, '').replace(/\uFE0F/gu, '').replace(/\u200D/gu, '').replace(/\u20E3/gu, '');
  return rest === '';
}
