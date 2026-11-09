package web

import tsproto.Commands
import tsproto.MyTsChatTag
import tsproto.Json
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNull

class MyTsChatTagTest {
    @Test
    fun publishesCompleteOfficialTagOnClientUserTagOnly() {
        val signedToken = ByteArray(192) { (it * 31).toByte() }
        val encodedToken = Base64.getEncoder().encodeToString(signedToken)
        val identifier = "aaanimal@myteamspeak.com"
        val updated = 1_793_880_777_317L
        val payload = MyTsChatTag.Payload(identifier, encodedToken, updated)

        val command = Commands.parse(MyTsChatTag.updateCommand(payload))
        assertEquals("clientupdate", command.name)
        val json = command["client_user_tag"] ?: error("client_user_tag missing")
        val fields = Json.parse(json) as Map<*, *>

        assertEquals(encodedToken, fields["myts_token"])
        assertEquals(identifier, fields["tag"])
        assertEquals(updated, (fields["updated"] as Number).toLong())
        assertContentEquals(signedToken, Base64.getDecoder().decode(fields["myts_token"] as String))
        assertNull(command["client_meta_data"])
        assertEquals("quiet-myts-tag", command["return_code"])
    }
}
