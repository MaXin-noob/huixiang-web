package tsproto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * 频道图标在 TS6 里是频道权限 `i_icon_id`：正值要 `channeladdperm`，清零/移除要 `channeldelperm`。
 * 新建频道的图标就是靠 [ChannelEdits.iconPerm] 在拿到服务器分配的 cid 之后补发这条命令。
 */
class ChannelEditsTest {
    @Test
    fun iconPermAddsPermissionWhenPositive() {
        val e = ChannelEdits.iconPerm(42, 12345L)
        assertEquals("channeladdperm", e.name)
        assertEquals(42, e.params.first { it.first == "cid" }.second)
        assertEquals("i_icon_id", e.params.first { it.first == "permsid" }.second)
        assertEquals(12345L, e.params.first { it.first == "permvalue" }.second)
    }

    @Test
    fun iconPermDeletesPermissionWhenCleared() {
        val e = ChannelEdits.iconPerm(7, 0L)
        assertEquals("channeldelperm", e.name)
        assertEquals(7, e.params.first { it.first == "cid" }.second)
        assertEquals("i_icon_id", e.params.first { it.first == "permsid" }.second)
        assertFalse(e.params.any { it.first == "permvalue" })
    }

    @Test
    fun createDoesNotSendReadOnlyChannelIconId() {
        // channel_icon_id 只读、channeledit/create 传它会被服务器回 invalid parameter；
        // 新建时 iconId 必须留到 channeladdperm 里发，不能混进 channelcreate。
        val e = ChannelEdits.create(ChannelEdits.Settings(name = "x", iconId = 99L))
        assertEquals("channelcreate", e.name)
        assertTrue(e.params.none { it.first == "channel_icon_id" })
        assertTrue(e.params.none { it.first == "i_icon_id" })
    }
}
