// Web-only 直播（LiveKit）的两次 HTTP 调用。
//
// 媒体完全走 LiveKit，网关只负责：
//   · 签一个只能进「本频道房间」的 JWT（主播 canPublish=true，观众 false）；
//   · 收下主播的「开始/停止推流」通知，再广播给同频道的其他网页。
//
// 这两个请求都用 X-File-Token 认会话 —— 和频道文件区是同一个令牌，浏览器本来就拿着。

export interface LiveKitTokenResult {
  ok: boolean;
  url?: string;
  token?: string;
  error?: string;
}

/** 向网关要一个进房 token。[publish] 为 true 时是主播（可发布），false 是观众。 */
export async function fetchLiveKitToken(fileToken: string, publish: boolean): Promise<LiveKitTokenResult> {
  try {
    const res = await fetch('/rtc/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-File-Token': fileToken },
      body: JSON.stringify({ publish }),
    });
    let data: { ok?: boolean; url?: string; token?: string; error?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      // 网关没按 JSON 回（多半是反代把请求吞了），下面按状态码兜底
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `直播令牌获取失败（${res.status}）` };
    }
    return { ok: true, url: data.url, token: data.token };
  } catch (e) {
    return { ok: false, error: `连不上网关：${e instanceof Error ? e.message : String(e)}` };
  }
}

/** 告诉网关「我开始/停止推流了」，好让同频道的人看到「直播中」。失败不打断画面。 */
export async function reportLivePublishing(fileToken: string, active: boolean): Promise<void> {
  try {
    await fetch('/rtc/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-File-Token': fileToken },
      body: JSON.stringify({ publish: true, active }),
    });
  } catch {
    // 只是状态广播，失败了最多别人晚一点知道
  }
}
