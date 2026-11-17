package app.chipless

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.view.WindowManager
import android.webkit.JavascriptInterface

/** Native helpers exposed to the web client as `window.Native`. Called on a WebView thread. */
class Bridge(private val activity: Activity) {
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pending: String? = null

    private val vibrator: Vibrator? by lazy {
        if (Build.VERSION.SDK_INT >= 31) activity.getSystemService(VibratorManager::class.java)?.defaultVibrator
        else @Suppress("DEPRECATION") activity.getSystemService(Vibrator::class.java)
    }

    @JavascriptInterface
    fun speak(text: String) {
        activity.runOnUiThread {
            val t = tts
            if (t == null) {
                pending = text
                tts = TextToSpeech(activity.applicationContext) { status ->
                    ttsReady = status == TextToSpeech.SUCCESS
                    if (ttsReady) pending?.let { tts?.speak(it, TextToSpeech.QUEUE_FLUSH, null, "say") }
                    pending = null
                }
            } else if (ttsReady) {
                t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "say")
            }
        }
    }

    @JavascriptInterface
    fun haptic(kind: String) {
        val v = vibrator ?: return
        if (!v.hasVibrator()) return
        val effect = when (kind) {
            "tick" -> if (Build.VERSION.SDK_INT >= 29) VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK) else VibrationEffect.createOneShot(8, 60)
            "confirm" -> if (Build.VERSION.SDK_INT >= 29) VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK) else VibrationEffect.createOneShot(18, 120)
            "heavy" -> if (Build.VERSION.SDK_INT >= 29) VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK) else VibrationEffect.createOneShot(40, 255)
            "reject" -> VibrationEffect.createWaveform(longArrayOf(0, 30, 40, 30), -1)
            "turn" -> VibrationEffect.createWaveform(longArrayOf(0, 60, 80, 60), -1)
            else -> return
        }
        v.vibrate(effect)
    }

    @JavascriptInterface
    fun share(text: String) {
        activity.runOnUiThread {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
            activity.startActivity(Intent.createChooser(send, "Share results"))
        }
    }

    @JavascriptInterface
    fun keepAwake(on: Boolean) {
        activity.runOnUiThread {
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    fun close() {
        tts?.shutdown()
        tts = null
    }
}
