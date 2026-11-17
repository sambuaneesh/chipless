package app.pokerchips.server

import java.io.File

/**
 * Desktop dev server: serves web/dist from disk with LAN open, so the client can be
 * developed in a browser and tested from phones on the same network.
 * Usage: DevMain <webDistDir> [stateFile]
 */
fun main(args: Array<String>) {
    val dist = File(args.getOrElse(0) { "web/dist" })
    val stateFile = args.getOrNull(1)?.let(::File)
    val store = stateFile?.let { f ->
        object : Store {
            override fun load() = f.takeIf { it.exists() }?.readText()
            override fun save(data: String) {
                val tmp = File(f.path + ".tmp"); tmp.writeText(data); tmp.renameTo(f)
            }
        }
    }
    val session = Session(store)
    val server = Server(session) { p -> File(dist, p).takeIf { it.isFile && it.canonicalPath.startsWith(dist.canonicalPath) }?.readBytes() }
    server.lanOpen = true
    val port = server.start()
    val urls = Server.lanAddresses().map { "http://$it:$port/" }
    session.setLan(true, urls)
    session.onLan = { open -> server.lanOpen = open; session.setLan(open, if (open) urls else emptyList()) }
    println("HOST  http://127.0.0.1:$port/?host=${session.hostToken}")
    urls.forEach { println("GUEST $it") }
    Thread.currentThread().join()
}
