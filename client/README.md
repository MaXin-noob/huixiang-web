# 回响 · 网页前端

React 18 + TypeScript + Vite + [Semi Design](https://semi.design)。构建产物输出到 `dist/`，网关启动时会自动托管，同源访问。

## 开发

```bash
cd client
npm install
npm run dev          # http://localhost:5173，/ws 反代到 127.0.0.1:8080
```

先起网关（见 `../README.md`），再起前端。反代后是同源请求，网关的 Origin 校验按主机名判断，`localhost` 开发照常通过。

```bash
npm run build        # tsc 类型检查 + 打包到 dist/
```

## 结构

```
src/
  main.tsx                 入口（生产构建下注册 Service Worker）
  App.tsx                  连接生命周期、账号/语音/串流状态、聊天历史、对外回调
  protocol.ts              网关协议类型、本地存储、频道树工具
  gateway.ts               WebSocket 封装（含口令认证、账号/书签/好友消息）
  account.ts               账号错误码、头像裁切与 HTTP 上传/删除
  notify.ts                桌面通知：权限申请与弹通知（Notification API）
  files.ts                 文件字节：HTTP 下载/上传（列表命令仍走 gateway.ts）
  chatHistory.ts           频道聊天历史：IndexedDB，300 条 / 90 天
  stream.ts                屏幕 / 摄像头串流（画面是 WebRTC，不经网关）
  talking.ts               谁在说话：按语音帧的实际音量判读（静音帧不算）
  presence.ts              成员进出提示：对比前后两帧快照里我所在频道的成员
  ui.ts                    头像来源逐级回退、首字母、稳定配色
  styles.css               全局样式
  audio/
    context.ts             共用 AudioContext
    gain.ts                增益换算
    cues.ts                进出频道提示音（Web Audio 合成，无音频文件）
    player.ts              下行：每人一个 AudioDecoder，Web Audio 排程播放
    mic.ts                 上行：AudioWorklet 攒 20ms → 自动人声检测 → AudioEncoder 编 Opus
    capture-worklet.js     采集用的 worklet（纯 JS，不能写 TS）
  components/
    ConnectPage.tsx        登录 / 游客连接：地址、昵称、密码、口令、最近连接；云书签
    ServerHome.tsx         服务器页：频道列表、成员、聊天、控制条、文件/好友抽屉、设置
    StreamPanel.tsx        串流画面与工具条（全屏、静音）
    FilesPanel.tsx         频道文件区（右侧抽屉：浏览、下载、上传、新建文件夹、改名、删除）
    FriendsPanel.tsx       好友与云聊天（右侧抽屉）
    UserCard.tsx           成员资料卡（UID/频道/身份组/客户端/地区/状态、单人音量）
    UserAvatar.tsx         圆形头像：多地址逐级回退，最后是首字母
    VolumePopover.tsx      音量滑块
    AwayPopover.tsx        暂离设置与离开留言
    ChannelIcon.tsx        频道图标
    PeekGuard.tsx          登录页「捂眼」动画
    PresenceToasts.tsx     右下角成员进出提示（aria-live）
```

## 语音是怎么走的

浏览器打不开 UDP，所以语音经过网关中转，但**不转码**：

```
麦克风 → AudioWorklet（每 960 采样 = 20ms）
       → AudioEncoder('opus', 48kHz, mono)
       → WebSocket 二进制 [1][codec][opus…]
       → 网关原样塞进 TS 的 UDP 包
```

下行反过来：`[2][codec][clientId:2][opus…]` → 每个说话人一个 `AudioDecoder` → `AudioBufferSourceNode` 按时间排程。

几个必须这么写的点：

- **每人一个解码器**。混在一起解会把时间戳搞乱，而且一个人断线不该影响别人。
- **排程要兜底**。`when` 落后当前时间超过 0.4 秒就重新对齐，否则一次卡顿会让延迟永久累积。
- **worklet 必须连到 destination** 才会被驱动，中间垫一个 `gain=0` 的节点，不然麦克风会从扬声器放出来。
- **OpusHead 那 19 字节不能省**，WebCodecs 的 opus 解码器没有它就报配置错误。

### 说话方式

控制条上的三档决定「这一帧要不要发」：

- **自动**（默认）：`mic.ts` 按帧算 RMS，超过 `VAD_THRESHOLD = 0.015` 记为在说话，之后 `VAD_TAIL_MS = 600` 内继续发；安静时只监听、不编码，不占上行带宽，也不往服务器丢静音包。
- **常开**：一直发。
- **按住说话**：按住按钮或空格才发，松手时把 worklet 静音。
- 选择存在 `huixiang.micMode`。自动模式要一直听，所以 worklet 不会静音，只是不编码。
- 头像点亮的门槛是另一个常量 `TALK_LEVEL = 0.045`，只管显示，跟发不发无关。

> 说明：三档切换的界面入口尚未在 `ServerHome` 接入（`onMicMode` / `onPttHold` 回调已由 `App.tsx` 备好），当前固定为「自动」档。

## 浏览器要求

| 能力 | 需要 |
|---|---|
| 语音 | WebCodecs（`AudioDecoder` / `AudioEncoder`）：Chrome/Edge 94+、Firefox 130+、Safari 26+（iOS 26+） |
| 文字、频道 | 任何现代浏览器 |

不支持 WebCodecs 时页面顶部会提示，文字和频道功能照常可用。

## 本地存储

| 键 | 存什么 |
|---|---|
| `huixiang.identity` | TS 身份导出串。**不清它，服务器上的权限和组才会保留** |
| `huixiang.token` | 访问口令（仅当网关要求时） |
| `huixiang.nickname` | 上次用的昵称 |
| `huixiang.recent` | 最近连过的地址，最多 8 条 |
| `huixiang.micGain` / `huixiang.volumes` | 麦克风增益、按 uid 记的成员音量 |
| `huixiang.micMode` | 说话方式：`auto` 自动（默认）/ `open` 常开 / `ptt` 按住说话 |
| `huixiang.notify` | 桌面消息通知开关（`1` 开 / `0` 关；真正的权限在浏览器站点设置里） |

myTeamSpeak 的邮箱、密码、会话令牌、书签密钥和云书签内容**都不进 localStorage**：登录会话只保存在网关内存里。浏览器只留一枚 `huixiang_account` 的 `HttpOnly` cookie（随机 id，JS 读不到），用于自动恢复登录；默认 30 天后过期，退出登录会立即清掉。

## 测试脚本

`test/shot.mjs` 用本机 Edge 的 headless 模式 + CDP 打开页面、执行一段脚本、截图、收集控制台报错：

```bash
node test/shot.mjs http://127.0.0.1:8080/ shot.png 3000 "document.title"
```

配合 `../gateway/test/listen.mjs` 可以验证浏览器真的把声音发出来了：

```bash
# 终端 1：监听端先进同一频道
node ../gateway/test/listen.mjs pi.animal26.site 9987 1 30

# 终端 2：用模拟麦克风打开页面、点开麦克风
FAKE_MIC=1 node test/shot.mjs http://127.0.0.1:8080/ shot.png 3000 "..."
```

`FAKE_MIC=1` 会带上 `--use-fake-device-for-media-stream` 和 `--use-fake-ui-for-media-stream`，不需要真设备也不用点授权。

## 账号与头像

连接页顶部是 myTeamSpeak 账号卡片，下面仍是原来的游客连接表单——不登录也能填地址进。

- 登录后显示账号昵称、邮箱和头像，并拉取云书签和好友列表；点云书签会把地址、昵称和服务器密码填进表单（密码不显示）。
- 头像上传 / 删除的界面入口随服务器页重构暂时下线：`account.ts` 已实现裁图（320×320、512 KB 内 PNG）与 `POST /account/avatar`，`App.tsx` 也已备好 `changeAccountAvatar` / `removeAccountAvatarNow`，待 `ServerHome` 提供入口后即可恢复。
- 频道里成员头像优先用服务器头像（`/avatar/<avatarToken>/<id>?v=<flag>`），其次对方公开的 myTS 头像，失败退回首字母；自己登录时优先用账号头像。
- 好友既可查看列表，也能跨服云聊天（Matrix）；登录后连接会带 myTeamSpeak 语音身份，要完全匿名先退出账号。
- **记住登录**：密码登录成功后网关发一条 `remember` 消息，`account.ts` 把它换成 `HttpOnly` cookie（30 天）；之后打开或刷新页面会自动连上网关并恢复登录，退出登录则删掉 cookie。密码、令牌和书签密钥都不进浏览器存储。

## 消息通知

服务器页顶栏「设置」面板里有一个「桌面通知」开关，开着时收到别人的消息会弹一条系统通知，切到别的窗口/标签页也能看见。

- 权限必须在点击开关时申请（浏览器只允许用户手势里调 `Notification.requestPermission`）；被拒绝或不支持（比如用 http 打开非 localhost）会提示，并且开关保持关闭。
- **私聊一律提醒**；频道消息只在页面不在前台、或者消息来自你当前不在的频道时提醒——正盯着当前频道的聊天就不打扰。
- 同一个人/同一个频道的新消息共用一个 `tag`，系统通知里是替换而不是堆一屏；点通知会把页面拉回前台。
- 关掉标签页后不再提醒（Service Worker 只做了壳缓存，没有接入 Web Push），这是当前实现的边界。

## 频道管理

网关与 `tsproto.ChannelEdits` 已实现建 / 删 / 改频道、踢人与封禁，以及频道排序；`App.tsx` 也把 `onCreateChannel`、`onEditChannel`、`onDeleteChannel`、`onKickMember`、`onBanMember` 等回调传给了服务器页。新版 `ServerHome` 已接入**新建 / 编辑 / 删除频道**（表单含名称、描述、父频道、类型、编解码、音质、人数上限与密码）；**踢人 / 封禁、频道排序**的界面入口尚未接入，旧的 `ServerPage` / `ChannelTree` 已随重构删除，需在新页面上重新接入。

## 成员进出提示

有人进入或离开你当前所在的频道时，右下角弹出一条提示，并配一声进 / 离提示音。纯前端实现：对比网关每 120ms 推送的快照里的频道成员即可，不额外请求服务器。只有你自己已经进入频道后才提示（首次进频道、自己换频道都不误报）。

## 功能现状

**已接入服务器页（`ServerHome`）**：频道列表（图标、密码锁、分隔符、折叠、按频道/成员搜索、双击进入含频道密码）、频道管理（新建 / 编辑 / 删除）、频道描述与在线人数、成员列表（说话状态、离开、直播中、资料卡、单人音量）、频道文字与历史翻页、「设置」里的桌面通知与说话方式三档切换（自动 / 常开 / 按住说话）、暂离（Away）、麦克风/扬声器音量、屏幕共享（WebRTC）与观看直播、频道文件（`FilesPanel`）、好友与云聊天（`FriendsPanel`）、戳一戳（成员资料卡右上角）、离开服务器。

**逻辑已就绪、界面接入中**：频道踢人 / 封禁、频道排序、改名、摄像头共享入口、头像上传 / 删除入口。详见根目录 README 的「开发计划」。

**尚未实现**：频道图标设置 / 更换 / 删除（当前只能显示服务器已有图标）、频道聊天内发图片、身份组 / 权限面板、移动成员、流媒体中继、触屏适配等。

> 说明：旧版 `ServerPage` 时代的私聊面板已合并进「好友」抽屉——对方在线走服务器私聊，离线走云端聊天（Matrix）。

## 文件是怎么走的

文件区可浏览、下载、上传、新建文件夹、改名、删除（写操作都带确认）。列表命令走 WebSocket，字节走 HTTP：

```
GET /files/download ──▶ 网关 ──ftinitdownload + TCP 30033──▶ TS 服务器
POST /files/upload  ──▶ 网关 ──ftinitupload  + TCP 30033──▶ TS 服务器
                              （文件本来就在服务器的频道文件区里）
```

- 下载用 `fetch` + `ReadableStream` 一块块读，进度是真的，中途断线立刻能发现（比 `res.blob()` 强）。
  攒够之后交给一个 `<a download>` 存盘。
- 端点要带 `X-File-Token`，值来自状态快照里的 `fileToken`——它代表这次会话，断开就作废。
- 开发模式下 `/files` 和 `/server-banner` 也要反代到网关（见 `vite.config.ts`），否则会打到 vite 自己。
- 上传 / 新建文件夹 / 改名 / 删除分别走 `POST /files/upload`、`POST /files/mkdir`、`POST /files/rename`、`DELETE /files`，同样带 `X-File-Token`；上传遇到同名文件会返回 `409`，前端弹确认后再带 `overwrite=1` 重传。
