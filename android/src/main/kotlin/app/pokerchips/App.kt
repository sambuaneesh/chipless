package app.pokerchips

import android.app.Application
import android.content.Intent
import android.os.Build
import android.util.AtomicFile
import app.pokerchips.server.Server
import app.pokerchips.server.Session
import app.pokerchips.server.Store
import java.io.File

/** Owns the table: session + server live as long as the process, independent of the UI. */
class App : Application() {
    lateinit var session: Session
        private set
    lateinit var server: Server
        private set

    override fun onCreate() {
        super.onCreate()
        val file = AtomicFile(File(filesDir, "session.json"))
        session = Session(object : Store {
            override fun load(): String? = runCatching { String(file.readFully(), Charsets.UTF_8) }.getOrNull()
            override fun save(data: String) {
                val out = file.startWrite()
                try {
                    out.write(data.toByteArray(Charsets.UTF_8))
                    file.finishWrite(out)
                } catch (e: Exception) {
                    file.failWrite(out)
                }
            }
        })
        server = Server(session) { path ->
            // Text assets are stored only as "<name>.gzip"; serve them as-is for "<name>.gz" requests,
            // or inflate them for the rare client that doesn't accept gzip.
            runCatching {
                when {
                    path.endsWith(".gz") -> assets.open("web/${path.removeSuffix(".gz")}.gzip").use { it.readBytes() }
                    else -> runCatching { assets.open("web/$path").use { it.readBytes() } }.getOrNull()
                        ?: java.util.zip.GZIPInputStream(assets.open("web/$path.gzip")).use { it.readBytes() }
                }
            }.getOrNull()
        }
        server.start()
        session.onLan = { open -> setLan(open) }
    }

    /** Open or close the table to other phones on the network. */
    fun setLan(open: Boolean) {
        server.lanOpen = open
        val svc = Intent(this, HostService::class.java)
        if (open) {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc) else startService(svc)
            refreshUrls()
        } else {
            stopService(svc)
            session.setLan(false, emptyList())
        }
    }

    fun refreshUrls(): List<String> {
        val urls = Server.lanAddresses().map { "http://$it:${server.port}/" }
        session.setLan(server.lanOpen, urls)
        return urls
    }
}
