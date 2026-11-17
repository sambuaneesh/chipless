package app.pokerchips.server

import java.io.DataInputStream
import java.net.Socket
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class JsonTest {
    @Test
    fun roundTrip() {
        val src = """{"a":1,"b":[true,false,null,"x\"y\n"],"c":{"d":-2.5,"e":"₹ ♠"},"f":12345678901}"""
        val v = Json.parse(src)
        assertEquals(src, Json.write(v))
    }
}

/** Minimal WebSocket test client (masked frames, as browsers send). */
class WsClient(port: Int, private val host: String = "127.0.0.1") {
    private val sock = Socket(host, port)
    private val out = sock.getOutputStream()
    private val input = DataInputStream(sock.getInputStream())
    val inbox = LinkedBlockingQueue<Obj>()

    init {
        out.write("GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n".toByteArray())
        val head = StringBuilder()
        while (!head.endsWith("\r\n\r\n")) head.append(input.read().toChar())
        check("101" in head.lines()[0]) { head }
        check("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=" in head.toString())
        Thread {
            try {
                while (true) {
                    val b0 = input.read(); if (b0 < 0) break
                    var len = input.read() and 0x7F
                    if (len == 126) len = input.readUnsignedShort()
                    else if (len == 127) len = input.readLong().toInt()
                    val p = ByteArray(len); input.readFully(p)
                    if (b0 and 0x0F == 1) inbox.add(Json.parse(String(p, Charsets.UTF_8)) as Obj)
                }
            } catch (_: Exception) {}
        }.apply { isDaemon = true }.start()
    }

    fun send(o: Map<String, Any?>) {
        val p = Json.write(o).toByteArray()
        val mask = byteArrayOf(1, 2, 3, 4)
        val f = java.io.ByteArrayOutputStream()
        f.write(0x81)
        if (p.size < 126) f.write(0x80 or p.size) else { f.write(0x80 or 126); f.write(p.size shr 8); f.write(p.size and 255) }
        f.write(mask)
        p.forEachIndexed { i, b -> f.write(b.toInt() xor mask[i and 3].toInt()) }
        out.write(f.toByteArray()); out.flush()
    }

    fun next(t: String): Obj {
        while (true) {
            val m = inbox.poll(3, TimeUnit.SECONDS) ?: error("timeout waiting for $t")
            if (m["t"] == t) return m
        }
    }

    /** Latest state after draining. */
    fun state(): Obj {
        var s = next("state")
        while (true) { val m = inbox.poll(200, TimeUnit.MILLISECONDS) ?: break; if (m["t"] == "state") s = m }
        return s.obj("s")
    }

    fun close() = sock.close()
}

class ServerTest {
    private fun start(): Triple<Session, Server, Int> {
        val session = Session()
        val server = Server(session) { p -> if (p == "index.html") "<html>ok</html>".toByteArray() else null }
        val port = server.start(18737)
        return Triple(session, server, port)
    }

    @Test
    fun servesIndexOverHttp() {
        val (_, server, port) = start()
        Socket("127.0.0.1", port).use { s ->
            s.getOutputStream().write("GET / HTTP/1.1\r\nHost: x\r\n\r\n".toByteArray())
            val resp = s.getInputStream().readBytes().toString(Charsets.UTF_8)
            assertTrue(resp.startsWith("HTTP/1.1 200"), resp)
            assertTrue(resp.endsWith("<html>ok</html>"))
        }
        server.stop()
    }

    @Test
    fun hostAndGuestPlayAHandLive() {
        val (session, server, port) = start()
        val host = WsClient(port)
        host.send(mapOf("t" to "hello", "host" to session.hostToken))
        assertEquals("host", host.next("welcome")["role"])
        host.send(mapOf("t" to "cmd", "c" to "setup", "names" to listOf("Ann", "Ben"), "stack" to 1000, "sb" to 5, "bb" to 10, "button" to 0))
        var s = host.state()
        assertEquals("play", s["phase"])

        val guest = WsClient(port)
        guest.send(mapOf("t" to "hello"))
        assertEquals("guest", guest.next("welcome")["role"])
        guest.send(mapOf("t" to "claim", "id" to 2))
        val seat = guest.next("seat")
        assertNotNull(seat["token"])

        host.send(mapOf("t" to "cmd", "c" to "deal"))
        s = guest.state()
        val hand = s.obj("hand")
        assertEquals(1, hand.int("toAct")) // heads-up: button Ann acts first
        // Guest can't act for Ann.
        guest.send(mapOf("t" to "act", "id" to 1, "move" to "call", "seq" to s.long("seq")))
        assertEquals("You can only act for yourself", guest.next("error")["msg"])
        host.send(mapOf("t" to "act", "id" to 1, "move" to "call", "seq" to s.long("seq")))
        s = guest.state()
        assertEquals(2, s.obj("hand").int("toAct"))
        // Stale seq is rejected.
        guest.send(mapOf("t" to "act", "id" to 2, "move" to "check", "seq" to 0))
        assertTrue(guest.next("error").bool("stale").not())
        guest.send(mapOf("t" to "act", "id" to 2, "move" to "check", "seq" to s.long("seq")))
        s = host.state()
        assertEquals("flop", s.obj("hand").str("street"))
        // Guest undoes own check? No: Ann's turn hasn't come yet but the last action was Ben's.
        guest.send(mapOf("t" to "undo", "seq" to s.long("seq")))
        s = host.state()
        assertEquals("preflop", s.obj("hand").str("street"))
        assertTrue((s["notice"] as String).startsWith("Undone"))

        // Reconnect with the seat token restores the seat.
        guest.close()
        val again = WsClient(port)
        again.send(mapOf("t" to "hello", "seat" to seat["token"]))
        val w = again.next("welcome")
        assertEquals("player", w["role"]); assertEquals(2L, w["id"])
        again.close(); host.close(); server.stop()
    }

    @Test
    fun lanGateBlocksNonLoopbackWhenClosed() {
        val (_, server, port) = start()
        val lan = Server.lanAddresses().firstOrNull() ?: return server.stop()
        server.lanOpen = false
        val blocked = runCatching { Socket(lan, port).use { s -> s.getOutputStream().write("GET / HTTP/1.1\r\n\r\n".toByteArray()); s.getInputStream().read() } }.getOrNull()
        assertTrue(blocked == null || blocked == -1)
        server.stop()
    }

    @Test
    fun persistsAndRestoresMidHand() {
        var saved: String? = null
        val store = object : Store { override fun load() = saved; override fun save(data: String) { saved = data } }
        val a = Session(store)
        val c = Client(true) {}
        a.connect(c)
        a.handle(c, Json.write(mapOf("t" to "hello", "host" to a.hostToken)))
        a.handle(c, Json.write(mapOf("t" to "cmd", "c" to "setup", "names" to listOf("A", "B", "C"), "button" to 0)))
        a.handle(c, Json.write(mapOf("t" to "cmd", "c" to "deal")))
        a.handle(c, Json.write(mapOf("t" to "act", "id" to 1, "move" to "raise", "to" to 30)))
        val b = Session(store)
        assertEquals(a.hostToken, b.hostToken)
        assertEquals(a.game.players.map { it.stack }, b.game.players.map { it.stack })
        assertEquals(2, b.game.hand!!.toAct)
    }
}
