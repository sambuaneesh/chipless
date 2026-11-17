package app.pokerchips.engine

import app.pokerchips.engine.Game.Companion.fmt

/**
 * Plain-language guidance derived from state: what the dealer should do, what the player
 * to act can do, and an optional teaching hint. Never stored; recomputed on every snapshot.
 */
object Coach {
    data class Hint(val key: String, val text: String)

    /** Dealer instruction for the physical cards, or null when there's nothing to deal. */
    fun cue(g: Game): String? {
        val h = g.hand ?: return null
        if (h.street == Street.PREFLOP && h.streetActions == 0) {
            val first = h.dealt[(h.dealt.indexOf(h.button) + 1) % h.dealt.size]
            return "Shuffle and deal 2 cards each, one at a time — start with ${g.player(first).name}, end with ${g.player(h.button).name}."
        }
        if (h.streetActions == 0) when (h.street) {
            Street.FLOP -> return "Burn 1 · deal 3 face up — the Flop"
            Street.TURN -> return "Burn 1 · deal 1 face up — the Turn"
            Street.RIVER -> return "Burn 1 · deal 1 face up — the River"
            else -> {}
        }
        if (h.street == Street.SHOWDOWN) {
            return when (h.runoutFrom) {
                Street.PREFLOP -> "All-in: everyone shows. Deal the Flop, Turn and River (burn 1 before each)."
                Street.FLOP -> "All-in: everyone shows. Burn 1, deal the Turn · burn 1, deal the River."
                Street.TURN -> "All-in: everyone shows. Burn 1, deal the River."
                else -> "Showdown — ${g.player(g.showFirst(h)).name} shows first, then clockwise."
            }
        }
        return null
    }

    /** One sentence: what is happening now and what can be done. */
    fun prompt(g: Game): String {
        val h = g.hand
        if (h == null || !h.open) {
            return if (g.handNo == 0) "Ready. Tap Deal to start the first hand." else "Hand over. Tap Deal for the next hand."
        }
        if (h.street == Street.SHOWDOWN) return "Who won? Tap the winner, or enter the cards and let the app decide."
        val id = h.toAct ?: return ""
        val p = g.player(id)
        val l = g.legal(id)
        val opts = ArrayList<String>()
        if (l.canCheck) opts.add("check")
        if (l.canCall) opts.add(if (l.call >= p.stack) "call ${fmt(l.call)} (all-in)" else "call ${fmt(l.call)}")
        if (l.canRaise) {
            val word = if (l.isBet) "bet" else "raise to"
            opts.add(if (l.minTo == l.maxTo) "go all-in for ${fmt(l.maxTo)}" else "$word ${fmt(l.minTo)}+")
        }
        if (!l.canCheck) opts.add("fold")
        val list = when (opts.size) {
            1 -> opts[0]
            else -> opts.dropLast(1).joinToString(", ") + " or " + opts.last()
        }
        return "${p.name}: $list."
    }

    /** A teaching hint for the current moment, keyed so clients can fade it once learned. */
    fun hint(g: Game): Hint? {
        val h = g.hand ?: return null
        if (h.street == Street.SHOWDOWN) {
            return Hint("showdown", "Each player makes the best 5 cards from their 2 + the 5 on the board. Unsure who won? Use “Enter cards”.")
        }
        if (!h.betting) return null
        val id = h.toAct ?: return null
        val l = g.legal(id)
        val p = g.player(id)
        if (l.canCall && l.call >= p.stack && h.live.size > 2) {
            return Hint("short-call", "Calling puts ${p.name} all-in. They can only win what they matched from each player — the rest forms a side pot.")
        }
        if (!l.canRaise && l.noRaiseWhy != null && !l.noRaiseWhy.startsWith("You don't")) {
            return Hint("no-reopen", l.noRaiseWhy)
        }
        if (h.street == Street.PREFLOP && id == h.bbId && l.canCheck) {
            return Hint("bb-option", "Big blind's option: everyone just called, so ${p.name} can check for free or raise.")
        }
        if (l.canCheck && h.currentBet == 0) {
            return Hint("check-or-bet", "No bet yet. Check to pass for free, or bet at least ${fmt(h.bb)} (the big blind).")
        }
        if (h.street == Street.PREFLOP && h.streetActions == 0) {
            return Hint("preflop", "Blinds are forced bets that start the pot. Action starts left of the big blind.")
        }
        if (l.canCall && l.canRaise) {
            return Hint("min-raise", "To stay in, call ${fmt(l.call)}. A raise must add at least ${fmt(h.lfr)} (the last bet/raise size), so the minimum is ${fmt(l.minTo)}.")
        }
        return null
    }
}
