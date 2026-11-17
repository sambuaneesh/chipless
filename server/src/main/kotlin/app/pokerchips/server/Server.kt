package app.pokerchips.server

import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/** Static files for the web client. Paths are relative, e.g. "index.html", "app.js". */
fun interface Assets {
    fun read(path: String): ByteArray?
}

/**
 * Tiny HTTP/1.1 + WebSocket (RFC 6455) server on a plain ServerSocket, one thread per
 * connection. Serves the web client and speaks the table protocol to [Session].
 * When [lanOpen] is false only loopback connections (the host WebView) are accepted.
 */
class Server(private val session: Session, private val assets: Assets) {
    @Volatile var lanOpen = false
    @Volatile private var socket: ServerSocket? = null
    var port = 0
        private set

    fun start(preferred: Int = DEFAULT_PORT): Int {
        var s: ServerSocket? = null
        for (p in preferred until preferred + 20) {
            try {
                s = ServerSocket().apply { reuseAddress = true; bind(InetSocketAddress(p), 64) }
                break
            } catch (e: IOException) { s = null }
        }
        val ss = s ?: ServerSocket(0)
        socket = ss
        port = ss.localPort
        thread(isDaemon = true, name = "http-accept") {
            while (!ss.isClosed) {
                val c = try { ss.accept() } catch (e: IOException) { break }
                thread(isDaemon = true, name = "http-conn") { serve(c) }
            }
        }
        return port
    }

    fun stop() { runCatching { socket?.close() } }

    private class Request(val method: String, val path: String, val headers: Map<String, String>)

    private fun serve(sock: Socket) {
        try {
            sock.use {
                val loopback = sock.inetAddress.isLoopbackAddress
                if (!lanOpen && !loopback) return
                sock.soTimeout = 15_000
                sock.tcpNoDelay = true
                val input = BufferedInputStream(sock.getInputStream())
                val out = BufferedOutputStream(sock.getOutputStream())
                val req = readHead(input) ?: return
                if (req.headers["upgrade"]?.equals("websocket", ignoreCase = true) == true) {
                    websocket(sock, input, out, req, loopback)
                } else {
                    http(out, req)
                }
            }
        } catch (e: IOException) {
            // Client went away.
        }
    }

    private fun readHead(input: InputStream): Request? {
        val buf = java.io.ByteArrayOutputStream()
        var last4 = 0
        while (true) {
            val b = input.read()
            if (b < 0) return null
            buf.write(b)
            last4 = (last4 shl 8) or b
            if (last4 == 0x0d0a0d0a) break
            if (buf.size() > 16_384) return null
        }
        val lines = buf.toString(Charsets.ISO_8859_1.name()).split("\r\n")
        val parts = lines[0].split(" ")
        if (parts.size < 3) return null
        val headers = HashMap<String, String>()
        for (l in lines.drop(1)) {
            val i = l.indexOf(':')
            if (i > 0) headers[l.substring(0, i).trim().lowercase()] = l.substring(i + 1).trim()
        }
        return Request(parts[0], parts[1], headers)
    }

    private fun http(out: OutputStream, req: Request) {
        if (req.method != "GET" && req.method != "HEAD") return respond(out, 405, "text/plain", "Method not allowed".toByteArray(), req)
        var path = req.path.substringBefore('?').substringBefore('#').trimStart('/')
        if (path.isEmpty()) path = "index.html"
        if (".." in path || path.startsWith("/")) return respond(out, 404, "text/plain", "Not found".toByteArray(), req)
        val gzipOk = req.headers["accept-encoding"]?.contains("gzip") == true
        val gz = if (gzipOk) assets.read("$path.gz") else null
        val body = gz ?: assets.read(path)
            ?: return respond(out, 404, "text/plain", "Not found".toByteArray(), req)
        respond(out, 200, contentType(path), body, req, gzip = gz != null)
    }

    private fun respond(out: OutputStream, code: Int, type: String, body: ByteArray, req: Request, gzip: Boolean = false) {
        val status = when (code) { 200 -> "OK"; 404 -> "Not Found"; else -> "Method Not Allowed" }
        val head = buildString {
            append("HTTP/1.1 $code $status\r\n")
            append("Content-Type: $type\r\n")
            append("Content-Length: ${body.size}\r\n")
            if (gzip) append("Content-Encoding: gzip\r\nVary: Accept-Encoding\r\n")
            append("Cache-Control: no-cache\r\n")
            append("X-Content-Type-Options: nosniff\r\n")
            append("Connection: close\r\n\r\n")
        }
        out.write(head.toByteArray(Charsets.ISO_8859_1))
        if (req.method != "HEAD") out.write(body)
        out.flush()
    }

    private fun contentType(p: String) = when (p.substringAfterLast('.')) {
        "html" -> "text/html; charset=utf-8"
        "js" -> "text/javascript; charset=utf-8"
        "css" -> "text/css; charset=utf-8"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "webmanifest", "json" -> "application/json"
        "mp4" -> "video/mp4"
        "webm" -> "video/webm"
        "ico" -> "image/x-icon"
        else -> "application/octet-stream"
    }

    // ------------------------------------------------------------------ websocket

    private fun websocket(sock: Socket, input: InputStream, out: OutputStream, req: Request, loopback: Boolean) {
        val key = req.headers["sec-websocket-key"] ?: return
        val accept = Base64.getEncoder().encodeToString(
            MessageDigest.getInstance("SHA-1").digest((key + WS_GUID).toByteArray(Charsets.ISO_8859_1)),
        )
        out.write(
            ("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
                "Sec-WebSocket-Accept: $accept\r\n\r\n").toByteArray(Charsets.ISO_8859_1),
        )
        out.flush()
        sock.soTimeout = 45_000
        val writer = FrameWriter(sock, out)
        val client = Client(loopback) { writer.text(it) }
        session.connect(client)
        try {
            val msg = java.io.ByteArrayOutputStream()
            var msgOp = 0
            while (true) {
                val b0 = input.read()
                if (b0 < 0) break
                val b1 = input.read()
                if (b1 < 0) break
                val fin = b0 and 0x80 != 0
                val op = b0 and 0x0F
                val masked = b1 and 0x80 != 0
                var len = (b1 and 0x7F).toLong()
                if (len == 126L) len = ((input.read() shl 8) or input.read()).toLong()
                else if (len == 127L) { len = 0; repeat(8) { len = (len shl 8) or input.read().toLong() } }
                if (len < 0 || len > MAX_MESSAGE) break
                val mask = if (masked) ByteArray(4).also { readFully(input, it) } else null
                val payload = ByteArray(len.toInt())
                readFully(input, payload)
                if (mask != null) for (i in payload.indices) payload[i] = (payload[i].toInt() xor mask[i and 3].toInt()).toByte()
                when (op) {
                    0x8 -> { writer.close(payload); break }
                    0x9 -> writer.pong(payload)
                    0xA -> {}
                    0x0, 0x1, 0x2 -> {
                        if (op != 0) { msg.reset(); msgOp = op }
                        msg.write(payload)
                        if (msg.size() > MAX_MESSAGE) break
                        if (fin && msgOp == 0x1) session.handle(client, msg.toString(Charsets.UTF_8.name()))
                    }
                    else -> break
                }
            }
        } catch (e: SocketTimeoutException) {
            // Dead client.
        } catch (e: IOException) {
            // Closed.
        } finally {
            session.disconnect(client)
            writer.shutdown()
        }
    }

    private fun readFully(input: InputStream, b: ByteArray) {
        var off = 0
        while (off < b.size) {
            val n = input.read(b, off, b.size - off)
            if (n < 0) throw IOException("EOF")
            off += n
        }
    }

    /** Writes frames on its own thread so a slow phone can't stall the table. Pings when idle. */
    private class FrameWriter(private val sock: Socket, private val out: OutputStream) {
        private val queue = LinkedBlockingQueue<ByteArray>()
        @Volatile private var open = true

        init {
            thread(isDaemon = true, name = "ws-writer") {
                try {
                    while (open) {
                        val f = queue.poll(20, TimeUnit.SECONDS) ?: frame(0x9, ByteArray(0))
                        out.write(f)
                        if (queue.isEmpty()) out.flush()
                    }
                } catch (e: Exception) {
                    // Socket closed.
                } finally {
                    runCatching { sock.close() }
                }
            }
        }

        fun text(s: String) = enqueue(frame(0x1, s.toByteArray(Charsets.UTF_8)))
        fun pong(p: ByteArray) = enqueue(frame(0xA, p))
        fun close(p: ByteArray) { enqueue(frame(0x8, p.copyOf(minOf(p.size, 2)))); open = false }
        fun shutdown() { open = false; queue.offer(ByteArray(0)) }

        private fun enqueue(f: ByteArray) {
            if (!open) return
            if (queue.size > 100) { open = false; runCatching { sock.close() }; return }
            queue.offer(f)
        }

        private fun frame(op: Int, p: ByteArray): ByteArray {
            val head = when {
                p.size < 126 -> byteArrayOf((0x80 or op).toByte(), p.size.toByte())
                p.size < 65536 -> byteArrayOf((0x80 or op).toByte(), 126, (p.size shr 8).toByte(), p.size.toByte())
                else -> ByteArray(10).also {
                    it[0] = (0x80 or op).toByte(); it[1] = 127
                    for (i in 0 until 8) it[9 - i] = (p.size.toLong() shr (8 * i)).toByte()
                }
            }
            return head + p
        }
    }

    companion object {
        const val DEFAULT_PORT = 8737
        private const val WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        private const val MAX_MESSAGE = 256 * 1024L

        /** Site-local IPv4 addresses players can reach, best guess first (Wi-Fi / hotspot). */
        fun lanAddresses(): List<String> {
            val found = ArrayList<Pair<Int, String>>()
            val ifs = runCatching { NetworkInterface.getNetworkInterfaces()?.toList() }.getOrNull() ?: return emptyList()
            for (ni in ifs) {
                if (!runCatching { ni.isUp && !ni.isLoopback }.getOrDefault(false)) continue
                val n = ni.name.lowercase()
                if (n.startsWith("rmnet") || n.startsWith("ccmni") || n.startsWith("tun") || n.startsWith("dummy") || n.startsWith("docker") || n.startsWith("veth")) continue
                for (a in ni.inetAddresses) {
                    if (a !is Inet4Address || !a.isSiteLocalAddress) continue
                    val rank = when {
                        n.startsWith("ap") || n.startsWith("swlan") || n.contains("softap") -> 0
                        n.startsWith("wlan") -> 1
                        n.startsWith("eth") || n.startsWith("en") -> 2
                        else -> 3
                    }
                    found.add(rank to a.hostAddress)
                }
            }
            return found.sortedBy { it.first }.map { it.second }.distinct()
        }
    }
}
