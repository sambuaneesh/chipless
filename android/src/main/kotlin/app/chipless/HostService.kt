package app.chipless

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

/**
 * Keeps the process (and Wi-Fi radio) alive while other phones are connected to the table.
 * Type specialUse: a local game server isn't covered by the other types, and dataSync is
 * capped at 6 h/day on Android 15+.
 */
class HostService : Service() {
    private var wake: PowerManager.WakeLock? = null
    private var wifi: WifiManager.WifiLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var lastUrls: List<String> = emptyList()

    private val refresh = object : Runnable {
        override fun run() {
            val app = application as App
            if (!app.server.lanOpen) return
            val urls = app.refreshUrls()
            if (urls != lastUrls) { lastUrls = urls; notifyStatus(urls) }
            handler.postDelayed(this, 4000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Hosting a table", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Shown while friends' phones can join your table"
            setShowBadge(false)
        })
        val n = notification(lastUrls)
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(ID, n)

        if (wake == null) {
            wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "chipless:host").apply {
                setReferenceCounted(false); acquire(12 * 60 * 60 * 1000L)
            }
            @Suppress("DEPRECATION")
            val mode = if (Build.VERSION.SDK_INT >= 29) WifiManager.WIFI_MODE_FULL_LOW_LATENCY else WifiManager.WIFI_MODE_FULL_HIGH_PERF
            wifi = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).createWifiLock(mode, "chipless:host").apply {
                setReferenceCounted(false); acquire()
            }
        }
        handler.removeCallbacks(refresh)
        handler.post(refresh)
        return START_STICKY
    }

    private fun notification(urls: List<String>): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val text = urls.firstOrNull()?.removePrefix("http://")?.trimEnd('/')?.let { "Friends join at $it" }
            ?: "Waiting for Wi-Fi or hotspot…"
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Your poker table is open")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

    private fun notifyStatus(urls: List<String>) {
        getSystemService(NotificationManager::class.java).notify(ID, notification(urls))
    }

    override fun onDestroy() {
        handler.removeCallbacks(refresh)
        runCatching { wake?.release() }
        runCatching { wifi?.release() }
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "host"
        private const val ID = 1
    }
}
