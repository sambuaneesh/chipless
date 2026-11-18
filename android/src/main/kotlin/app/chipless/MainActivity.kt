package app.chipless

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher

/** One full-screen WebView showing the table served by [App] on localhost. */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var bridge: Bridge
    private var backCallback: OnBackInvokedCallback? = null
    private var pickCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as App
        if (0 != applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) WebView.setWebContentsDebuggingEnabled(true)

        bridge = Bridge(this)
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#090E0C"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.setSupportZoom(false)
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addJavascriptInterface(bridge, "Native")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    val host = req.url.host
                    if (host == "127.0.0.1" || host == "localhost") return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, req.url)) }
                    return true
                }
            }
            // <input type="file"> (restoring a backup) opens the system file picker.
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    pickCallback?.onReceiveValue(null)
                    pickCallback = cb
                    val pick = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                    return runCatching { startActivityForResult(pick, REQ_PICK); true }.getOrElse { pickCallback = null; false }
                }
            }
        }
        val root = android.widget.FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#090E0C"))
            addView(web)
        }
        applyInsets(root)
        setContentView(root)
        setupBack()
        web.loadUrl("http://127.0.0.1:${app.server.port}/?host=${app.session.hostToken}")
        if (app.server.lanOpen) app.refreshUrls()
        app.session.onLan = { open ->
            if (open) askNotificationPermission()
            app.setLan(open)
        }
    }

    /** Edge-to-edge: pad the WebView for system bars, cutouts and the keyboard. */
    private fun applyInsets(root: View) {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.setSystemBarsAppearance(0, android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS)
            root.setOnApplyWindowInsetsListener { v, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                val ime = insets.getInsets(WindowInsets.Type.ime())
                v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
                WindowInsets.CONSUMED
            }
        }
    }

    private fun setupBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            val cb = OnBackInvokedCallback { handleBack() }
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb)
            backCallback = cb
        }
    }

    @Deprecated("Pre-33 back handling")
    override fun onBackPressed() = handleBack()

    /** Let the web UI close a sheet first; otherwise go to the background (the table keeps running). */
    private fun handleBack() {
        web.evaluateJavascript("window.__back ? window.__back() : false") { r ->
            if (r != "true") moveTaskToBack(true)
        }
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    fun saveFile(name: String, mime: String, text: String) {
        pendingSave = text
        val create = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name)
        runCatching { startActivityForResult(create, REQ_SAVE) }.onFailure {
            pendingSave = null
            Toast.makeText(this, "No file manager found. Use Share instead.", Toast.LENGTH_LONG).show()
        }
    }

    fun exitApp() {
        (application as App).setLan(false)
        finishAndRemoveTask()
        web.postDelayed({ android.os.Process.killProcess(android.os.Process.myPid()) }, 400)
    }

    @Deprecated("Simple result handling without AndroidX")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_PICK -> {
                pickCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
                pickCallback = null
            }
            REQ_SAVE -> {
                val text = pendingSave
                pendingSave = null
                val uri = data?.data
                if (resultCode != RESULT_OK || uri == null || text == null) return
                val ok = runCatching {
                    contentResolver.openOutputStream(uri, "wt")!!.use { it.write(text.toByteArray(Charsets.UTF_8)) }
                }.isSuccess
                Toast.makeText(this, if (ok) "Saved" else "Couldn't save the file", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        val app = application as App
        app.session.onLan = { open -> app.setLan(open) }
        if (Build.VERSION.SDK_INT >= 33) backCallback?.let { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it) }
        bridge.close()
        web.destroy()
        super.onDestroy()
    }

    @Suppress("unused")
    private fun open(uri: String) = startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)))

    companion object {
        private const val REQ_PICK = 11
        private const val REQ_SAVE = 12
    }
}
