package app.chipless.server

import app.chipless.engine.Game
import app.chipless.engine.Game.Companion.fmt
import app.chipless.engine.Settle
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The whole night as plain text: table, standings, settle-up and every hand, for people to read and keep. */
object Report {
    private const val RULE = "────────────────────────────────────────"

    fun text(g: Game, cfg: Config, ended: Boolean, now: Long): String {
        val b = StringBuilder()
        fun line(s: String = "") { b.append(s).append('\n') }
        val time = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale.US)
            .format(Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault()))
        line("CHIPLESS — POKER NIGHT")
        line("Exported $time")
        line(RULE)
        if (!g.created) {
            line("No game has been set up yet.")
            return b.toString()
        }
        val money = cfg.mode == "money"
        line("Status:    ${if (ended) "Game ended" else if (g.inHand) "In progress (hand ${g.handNo} is being played)" else "In progress"}")
        line("Hands:     ${g.handNo}")
        line("Blinds:    ${fmt(cfg.sb)}/${fmt(cfg.bb)}${if (cfg.timer) ", rising every ${cfg.minutes} min" else ""}")
        line("Buy-in:    ${fmt(cfg.stack)} chips${if (money) " = ${amount(cfg.money, cfg)}" else " (just points)"}")
        line()

        val h = g.hand?.takeIf { it.open }
        val everyone = g.players + g.departed
        val chips = everyone.associate { it.id to (it.stack + (h?.tc(it.id) ?: 0) - it.buyIn).toLong() }
        val balanced = chips.values.sum() == 0L
        val cash = if (money && balanced) Settle.toMoney(chips, cfg.money, cfg.stack.toLong()) else null
        line("STANDINGS")
        val w = maxOf(6, everyone.maxOf { it.name.length })
        line("  " + "Player".padEnd(w) + "  " + "Chips".padStart(9) + "  " + "Bought".padStart(9) + "  " + "Net".padStart(9) + if (cash != null) "  " + "Money".padStart(11) else "")
        everyone.sortedByDescending { chips[it.id] }.forEach { p ->
            val stack = p.stack + (h?.tc(p.id) ?: 0)
            val left = if (p in g.departed) " (left)" else ""
            line("  " + p.name.padEnd(w) + "  " + fmt(stack).padStart(9) + "  " + fmt(p.buyIn).padStart(9) + "  " +
                signed(chips.getValue(p.id)).padStart(9) + (cash?.let { "  " + amount(it.getValue(p.id), cfg, true).padStart(11) } ?: "") + left)
        }
        if (!balanced) line("  ! Chips don't balance (${fmt(everyone.sumOf { it.buyIn })} bought, ${fmt(everyone.sumOf { it.stack + (h?.tc(it.id) ?: 0) })} on the table).")
        line()
        if (balanced) {
            val basis = cash ?: chips
            val xs = Settle.minimal(basis)
            line(if (ended) "WHO PAYS WHOM" else "WHO PAYS WHOM (if the game ended now)")
            if (xs.isEmpty()) line("  Nobody owes anything.")
            xs.forEach { t ->
                val amt = if (cash != null) amount(t.amount, cfg) else "${fmt(t.amount.toInt())} chips"
                line("  ${g.player(t.from).name} pays ${g.player(t.to).name}: $amt")
            }
            line()
        }

        line("HAND HISTORY")
        line(RULE)
        val byHand = g.log.groupBy { it.hand }
        for ((no, lines) in byHand) {
            line(if (no == 0) "Setup" else "Hand $no")
            for (l in lines) {
                when (l.kind) {
                    "hand" -> line("    ${l.text.substringAfter(" — ")}")
                    "blinds" -> { line("    ${l.text}"); line("  PRE-FLOP") }
                    "street" -> line("  ${l.text.removeSuffix(".").removePrefix("The ").uppercase()}")
                    "board" -> line("    ▸ ${l.text}")
                    "win" -> line("  ★ ${l.text}")
                    "why" -> line("    ${l.text}")
                    else -> line("    ${l.text}")
                }
            }
            line()
        }
        line(RULE)
        line("Made with Chipless, a free poker chips app: https://sambuaneesh.github.io/chipless/")
        return b.toString()
    }

    private fun signed(n: Long) = (if (n > 0) "+" else if (n < 0) "-" else "") + fmt(kotlin.math.abs(n).toInt())

    /** Money from minor units with the currency code, e.g. "12.50 USD" (or plain "12.50"). */
    fun amount(minor: Long, cfg: Config, sign: Boolean = false): String {
        val d = cfg.decimals
        val abs = kotlin.math.abs(minor)
        val unit = Math.pow(10.0, d.toDouble()).toLong()
        var s = String.format(Locale.US, "%,d", abs / unit)
        if (d > 0 && abs % unit != 0L) s += "." + (abs % unit).toString().padStart(d, '0')
        val pre = if (minor < 0) "-" else if (sign && minor > 0) "+" else ""
        return pre + s + if (cfg.currency.isNotEmpty()) " ${cfg.currency}" else ""
    }
}
