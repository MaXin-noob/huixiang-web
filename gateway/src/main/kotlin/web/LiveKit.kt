package web

import tsproto.Json
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * LiveKit 的部署参数，全部来自环境变量（见 deploy/docker-compose.sfu.yml）。
 *
 * [url] 是浏览器连的地址（wss://域名，livekit-client 会自己拼 /rtc）；[apiUrl] 是网关在容器网络里
 * 找 LiveKit 的内部地址，目前只用来做健康检查/后续 RoomService，签 token 不需要连它。
 */
object LiveKitConfig {
    private fun env(name: String): String = System.getenv(name)?.trim().orEmpty()

    val url: String = env("LIVEKIT_URL")
    val apiUrl: String = env("LIVEKIT_API_URL")
    val key: String = env("LIVEKIT_API_KEY")
    val secret: String = env("LIVEKIT_API_SECRET")

    val enabled: Boolean get() = url.isNotEmpty() && key.isNotEmpty() && secret.isNotEmpty()
}

/**
 * Web-only 直播：浏览器把屏幕（和系统声音）推给 LiveKit，同频道的其他网页订阅观看。
 *
 * 网关不碰媒体，只做两件事：按「服务器 + 频道」算出房间名并签一个只能进这个房间的 JWT；记住当前
 * 谁在播，好让同频道的其他网页知道该显示「直播中」。原生 TeamSpeak 客户端不参与这条链路。
 */
object LiveKit {
    data class Publisher(val clientId: Int, val name: String, val uid: String)

    data class TokenResult(
        val ok: Boolean,
        val url: String? = null,
        val token: String? = null,
        val error: String? = null,
        val status: Int = 200,
    )

    /** room -> (clientId -> publisher)。同一频道允许多人同时推流，各自一条。 */
    private val byRoom = ConcurrentHashMap<String, ConcurrentHashMap<Int, Publisher>>()

    /** 房间名只由服务器地址和频道 id 决定：换标签页、换主播都还是同一个房间。 */
    fun roomName(serverKey: String, channelId: Int): String {
        if (serverKey.isEmpty() || channelId <= 0) return ""
        val digest = MessageDigest.getInstance("SHA-1").digest("$serverKey|$channelId".toByteArray())
        return "r_" + digest.joinToString("") { "%02x".format(it) }.take(24)
    }

    fun list(room: String): List<Publisher> = byRoom[room]?.values?.toList() ?: emptyList()

    fun add(room: String, publisher: Publisher) {
        byRoom.computeIfAbsent(room) { ConcurrentHashMap() }[publisher.clientId] = publisher
    }

    fun remove(room: String, clientId: Int): Publisher? {
        val roomMap = byRoom[room] ?: return null
        val publisher = roomMap.remove(clientId) ?: return null
        if (roomMap.isEmpty()) byRoom.remove(room, roomMap)
        return publisher
    }

    /**
     * 手写一个 HS256 JWT：不引入第三方库，claims 就是 LiveKit 文档里 video grant 那几个字段。
     */
    fun sign(identity: String, name: String, room: String, canPublish: Boolean): String {
        val now = System.currentTimeMillis() / 1000
        val header = b64("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
        val claims = linkedMapOf<String, Any?>(
            "iss" to LiveKitConfig.key,
            "sub" to identity,
            "name" to name,
            "nbf" to now - 10,
            "exp" to now + 6 * 3600,
            "video" to linkedMapOf<String, Any?>(
                "room" to room,
                "roomJoin" to true,
                "canPublish" to canPublish,
                "canSubscribe" to true,
                "canPublishData" to false,
            ),
        )
        val payload = b64(Json.write(claims).toByteArray())
        val data = "$header.$payload"
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(LiveKitConfig.secret.toByteArray(), "HmacSHA256"))
        return "$data.${b64(mac.doFinal(data.toByteArray()))}"
    }

    private fun b64(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}
