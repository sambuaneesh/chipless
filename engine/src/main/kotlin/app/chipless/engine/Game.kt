package app.chipless.engine

/** Thrown when an event is not legal in the current state. The message is shown to people. */
class RuleError(message: String) : Exception(message)

enum class Street { PREFLOP, FLOP, TURN, RIVER, SHOWDOWN, DONE }
enum class Move { FOLD, CHECK, CALL, RAISE }

/** How a player who joins or returns gets dealt in. */
enum class Entry {
    /** Posts a big blind next hand and plays immediately. */
    POST,
    /** Sits out until the big blind reaches them. */
    WAIT,
    /** Dealt in next hand with no extra post. */
    FREE,
}

/** Everything that can change the game. The log of these is the source of truth. */
sealed interface Event {
    data class Create(val names: List<String>, val stack: Int, val button: Int) : Event
    data class AddPlayer(val name: String, val stack: Int, val index: Int, val entry: Entry) : Event
    data class RemovePlayer(val id: Int) : Event
    data class SitOut(val id: Int) : Event
    data class SitIn(val id: Int, val entry: Entry) : Event
    data class Rebuy(val id: Int, val chips: Int) : Event
    data class Adjust(val id: Int, val stack: Int) : Event
    data class Rename(val id: Int, val name: String) : Event
    data class Reorder(val ids: List<Int>) : Event
    data class SetButton(val id: Int) : Event
    data class StartHand(val sb: Int, val bb: Int) : Event
    data class Act(val id: Int, val move: Move, val to: Int = 0) : Event

    /** Board cards recorded so far this hand (optional; the host may enter them as they're dealt). */
    data class Board(val cards: List<Int>) : Event

    /**
     * Showdown result. [ranking] lists live players best-first; players in the same group tie.
     * Live players not listed have mucked. Optional cards come from the Referee.
     */
    data class Award(
        val ranking: List<List<Int>>,
        val board: List<Int> = emptyList(),
        val holes: Map<Int, List<Int>> = emptyMap(),
    ) : Event
}

class Player(val id: Int, var name: String, var stack: Int) {
    var sittingOut = false
    var waiting = false
    var post = false
    /** Total chips bought (initial buy-in + rebuys). */
    var buyIn = 0
    /** Net host corrections to the stack. */
    var adjust = 0
}

data class Pot(val amount: Int, val eligible: List<Int>)

data class PotResult(val amount: Int, val eligible: List<Int>, val winners: List<Int>, val shares: Map<Int, Int>)

/**
 * One line of the table narrative. [kind] drives sounds and styling on clients; [tag] is the
 * short action label ("Raise 400"), [amount] the chips involved, [by] how much the bet went up.
 */
data class Line(
    val hand: Int,
    val text: String,
    val kind: String,
    val who: Int? = null,
    val tag: String? = null,
    val amount: Int = 0,
    val by: Int = 0,
)

data class Legal(
    val canCheck: Boolean,
    val canCall: Boolean,
    val call: Int,
    val canRaise: Boolean,
    val minTo: Int,
    val maxTo: Int,
    val isBet: Boolean,
    /** Why raising is not possible, in plain words (null when it is). */
    val noRaiseWhy: String?,
)

class Hand(
    val no: Int,
    val sb: Int,
    val bb: Int,
    val button: Int,
    val sbId: Int,
    val bbId: Int,
    /** Players dealt in, in seat order. */
    val dealt: List<Int>,
) {
    var street = Street.PREFLOP
    val sc = HashMap<Int, Int>()
    val tc = HashMap<Int, Int>()
    val folded = LinkedHashSet<Int>()
    var currentBet = 0
    var lfr = 0
    /** currentBet right after the player's last voluntary action this street; absent = not acted. */
    val acted = HashMap<Int, Int>()
    var toAct: Int? = null
    var riverAggressor: Int? = null
    var streetActions = 0
    /** Street the board had reached when an all-in ended the betting early. */
    var runoutFrom: Street? = null
    /** Last action label per player for this street ("Call 40"). */
    val label = HashMap<Int, String>()
    var results: List<PotResult> = emptyList()
    var board: List<Int> = emptyList()
    var holes: Map<Int, List<Int>> = emptyMap()
    var posts: List<Int> = emptyList()
    /** Who ended up all-in with less than a full raise, last on this street (for "why" text). */
    var lastShortAllIn: Int? = null

    fun sc(id: Int) = sc[id] ?: 0
    fun tc(id: Int) = tc[id] ?: 0
    val live get() = dealt.filter { it !in folded }
    /** Hand not finished yet (betting or awaiting showdown). */
    val open get() = street != Street.DONE
    val betting get() = street < Street.SHOWDOWN
}

class Game {
    val players = ArrayList<Player>()
    val departed = ArrayList<Player>()
    var hand: Hand? = null
        private set
    var handNo = 0
        private set
    var created = false
        private set
    private var prevButton: Int? = null
    private var prevBB: Int? = null
    private var forcedButton: Int? = null
    private var nextId = 1
    val log = ArrayList<Line>()

    val inHand get() = hand?.open == true
    val buttonId: Int? get() = hand?.button ?: forcedButton ?: prevButton

    fun player(id: Int): Player = players.firstOrNull { it.id == id } ?: departed.firstOrNull { it.id == id }
        ?: throw RuleError("No such player")

    fun seated(id: Int): Player = players.firstOrNull { it.id == id } ?: throw RuleError("No such player")

    private fun name(id: Int) = player(id).name

    private fun say(text: String, kind: String, who: Int? = null, tag: String? = null, amount: Int = 0, by: Int = 0) {
        log.add(Line(handNo, text, kind, who, tag, amount, by))
    }

    // ---------------------------------------------------------------- reducer

    fun apply(e: Event) {
        if (e !is Event.Create && !created) throw RuleError("Set up the game first")
        when (e) {
            is Event.Create -> create(e)
            is Event.AddPlayer -> addPlayer(e)
            is Event.RemovePlayer -> removePlayer(e.id)
            is Event.SitOut -> {
                val p = seated(e.id)
                p.sittingOut = true; p.waiting = false; p.post = false
                say("${p.name} sits out.", "seat", p.id)
            }
            is Event.SitIn -> {
                val p = seated(e.id)
                if (!p.sittingOut) throw RuleError("${p.name} is already playing")
                p.sittingOut = false
                applyEntry(p, e.entry)
                say("${p.name} is back${entryNote(e.entry)}.", "seat", p.id)
            }
            is Event.Rebuy -> {
                val p = seated(e.id)
                notInLiveHand(p)
                if (e.chips <= 0) throw RuleError("Rebuy must be more than 0")
                p.stack += e.chips; p.buyIn += e.chips
                say("${p.name} buys in for ${fmt(e.chips)}.", "rebuy", p.id)
            }
            is Event.Adjust -> {
                val p = seated(e.id)
                notInLiveHand(p)
                if (e.stack < 0) throw RuleError("Stack can't be negative")
                val was = p.stack
                p.adjust += e.stack - was; p.stack = e.stack
                say("Host corrected ${p.name}'s stack to ${fmt(e.stack)} (was ${fmt(was)}).", "fix", p.id)
            }
            is Event.Rename -> {
                val p = seated(e.id)
                val n = cleanName(e.name, except = p.id)
                say("${p.name} is now $n.", "seat", p.id)
                p.name = n
            }
            is Event.Reorder -> {
                betweenHands("Change seats")
                if (e.ids.sorted() != players.map { it.id }.sorted()) throw RuleError("Seat order must include everyone")
                val byId = players.associateBy { it.id }
                players.clear(); e.ids.mapTo(players) { byId.getValue(it) }
                say("Seats rearranged.", "seat")
            }
            is Event.SetButton -> {
                betweenHands("Move the button")
                val p = seated(e.id)
                forcedButton = p.id
                say("Button moved to ${p.name}.", "seat", p.id)
            }
            is Event.StartHand -> startHand(e.sb, e.bb)
            is Event.Act -> act(e)
            is Event.Board -> board(e.cards)
            is Event.Award -> award(e)
        }
    }

    private fun create(e: Event.Create) {
        if (created) throw RuleError("Game already set up")
        if (e.names.size !in 2..MAX_PLAYERS) throw RuleError("Pick 2 to $MAX_PLAYERS players")
        if (e.stack <= 0) throw RuleError("Starting stack must be more than 0")
        if (e.button !in e.names.indices) throw RuleError("Bad button seat")
        created = true
        for (n in e.names) {
            val p = Player(nextId++, cleanName(n), e.stack)
            p.buyIn = e.stack
            players.add(p)
        }
        forcedButton = players[e.button].id
        say("New game: ${players.size} players, ${fmt(e.stack)} chips each.", "game")
    }

    private fun addPlayer(e: Event.AddPlayer) {
        if (players.size >= MAX_PLAYERS) throw RuleError("The table is full ($MAX_PLAYERS seats)")
        if (e.stack <= 0) throw RuleError("Stack must be more than 0")
        val p = Player(nextId++, cleanName(e.name), e.stack)
        p.buyIn = e.stack
        players.add(e.index.coerceIn(0, players.size), p)
        applyEntry(p, if (handNo == 0) Entry.FREE else e.entry)
        say("${p.name} joins with ${fmt(e.stack)}${if (handNo == 0) "" else entryNote(e.entry)}.", "seat", p.id)
    }

    private fun applyEntry(p: Player, entry: Entry) {
        p.waiting = entry == Entry.WAIT && handNo > 0
        p.post = entry == Entry.POST && handNo > 0
    }

    private fun entryNote(entry: Entry) = when (entry) {
        Entry.POST -> " — posts a big blind next hand"
        Entry.WAIT -> " — waits for the big blind"
        Entry.FREE -> ""
    }

    private fun removePlayer(id: Int) {
        val p = seated(id)
        val h = hand
        if (h != null && h.open && id in h.dealt && id !in h.folded) {
            throw RuleError("${p.name} is still in this hand — fold them or finish the hand first")
        }
        val idx = players.indexOf(p)
        val before = players[(idx - 1 + players.size) % players.size].id
        val after = players[(idx + 1) % players.size].id
        if (prevButton == id) prevButton = if (before == id) null else before
        if (forcedButton == id) forcedButton = if (after == id) null else after
        if (prevBB == id) prevBB = null
        players.remove(p)
        departed.add(p)
        say("${p.name} leaves with ${fmt(p.stack)}.", "seat", p.id)
    }

    private fun cleanName(raw: String, except: Int? = null): String {
        val n = raw.trim().replace(Regex("\\s+"), " ").take(16)
        if (n.isEmpty()) throw RuleError("Name can't be empty")
        if (players.any { it.id != except && it.name.equals(n, ignoreCase = true) }) throw RuleError("$n is already at the table")
        return n
    }

    private fun betweenHands(what: String) {
        if (inHand) throw RuleError("$what after this hand")
    }

    private fun notInLiveHand(p: Player) {
        val h = hand
        if (h != null && h.open && p.id in h.dealt && p.id !in h.folded) {
            throw RuleError("${p.name} is in this hand — do that after the hand")
        }
    }

    // ---------------------------------------------------------------- hand start

    private data class Pos(val btn: Int, val sb: Int, val bb: Int)

    private fun positions(eligible: Set<Int>): Pos {
        val seats = players.map { it.id }
        val n = seats.size
        fun nextAfter(id: Int?, inclusive: Boolean): Int {
            val start = id?.let { seats.indexOf(it) }?.takeIf { it >= 0 } ?: 0
            val from = if (inclusive || id == null) 0 else 1
            for (k in from..n) {
                val c = seats[(start + k) % n]
                if (c in eligible) return c
            }
            throw IllegalStateException("no eligible seat")
        }
        fun place(btn: Int): Pos =
            if (eligible.size == 2) Pos(btn, btn, nextAfter(btn, false))
            else nextAfter(btn, false).let { sb -> Pos(btn, sb, nextAfter(sb, false)) }

        val forced = forcedButton
        if (forced != null) return place(nextAfter(forced, true))
        var pos = place(nextAfter(prevButton, false))
        // TDA 36-C: nobody posts the big blind twice in a row.
        if (pos.bb == prevBB) pos = place(nextAfter(pos.btn, false))
        return pos
    }

    private fun startHand(sb: Int, bb: Int) {
        if (inHand) throw RuleError("Finish this hand first")
        if (sb <= 0 || bb < sb) throw RuleError("Blinds must be positive, big ≥ small")
        val ready = players.filter { it.stack > 0 && !it.sittingOut }
        val base = ready.filter { !it.waiting }.map { it.id }.toMutableSet()
        val waiting = ready.filter { it.waiting }.map { it.id }
        if (base.size + waiting.size < 2) throw RuleError("Need at least 2 players with chips")
        var pos: Pos
        if (base.size < 2) {
            base.addAll(waiting)
            pos = positions(base)
        } else {
            pos = positions(base + waiting)
            if (pos.bb in waiting) base.add(pos.bb)
            if (waiting.any { it !in base }) pos = positions(base)
        }
        for (id in base) seated(id).waiting = false

        handNo++
        val dealt = players.map { it.id }.filter { it in base }
        val h = Hand(handNo, sb, bb, pos.btn, pos.sb, pos.bb, dealt)
        hand = h
        prevButton = pos.btn; prevBB = pos.bb; forcedButton = null

        fun post(id: Int, amount: Int): Int {
            val p = seated(id)
            val a = minOf(amount, p.stack)
            p.stack -= a
            h.sc[id] = h.sc(id) + a
            h.tc[id] = h.tc(id) + a
            return a
        }
        val sbPaid = post(pos.sb, sb)
        val bbPaid = post(pos.bb, bb)
        val posts = dealt.filter { seated(it).post && it != pos.btn && it != pos.sb && it != pos.bb }
        for (id in posts) post(id, bb)
        h.posts = posts
        for (id in dealt) seated(id).post = false
        h.currentBet = bb
        h.lfr = bb

        say("Hand #$handNo — ${name(pos.btn)} deals.", "hand")
        val blinds = buildString {
            append("${name(pos.sb)} posts ${allInTag(pos.sb, sbPaid)}small blind ${fmt(sbPaid)}, ")
            append("${name(pos.bb)} posts ${allInTag(pos.bb, bbPaid)}big blind ${fmt(bbPaid)}")
            for (id in posts) append(", ${name(id)} posts ${fmt(h.sc(id))}")
            append(".")
        }
        say(blinds, "blinds")
        h.toAct = nextNeeding(h, pos.bb)
        if (h.toAct == null) endRound(h)
    }

    private fun allInTag(id: Int, paid: Int) = if (seated(id).stack == 0 && paid > 0) "(all-in) " else ""

    // ---------------------------------------------------------------- betting

    private fun stack(id: Int) = seated(id).stack

    private fun owe(h: Hand, id: Int): Int {
        val others = h.live.filter { it != id }
        if (others.isEmpty()) return 0
        val target = if (others.any { stack(it) > 0 }) h.currentBet else minOf(h.currentBet, others.maxOf { h.sc(it) })
        return maxOf(0, target - h.sc(id))
    }

    private fun needsAction(h: Hand, id: Int): Boolean {
        if (id in h.folded || stack(id) == 0) return false
        val others = h.live.filter { it != id }
        if (others.isEmpty()) return false
        if (others.none { stack(it) > 0 } && h.sc(id) >= others.maxOf { h.sc(it) }) return false
        return id !in h.acted || owe(h, id) > 0
    }

    private fun nextNeeding(h: Hand, after: Int): Int? {
        val d = h.dealt
        val start = d.indexOf(after)
        for (k in 1..d.size) {
            val c = d[(start + k) % d.size]
            if (needsAction(h, c)) return c
        }
        return null
    }

    fun legal(id: Int): Legal {
        val h = hand ?: throw RuleError("No hand in progress")
        val o = owe(h, id)
        val st = stack(id)
        val othersCanRespond = h.live.any { it != id && stack(it) > 0 }
        val last = h.acted[id]
        val reopened = last == null || h.currentBet - last >= h.lfr
        val canRaise = st > o && othersCanRespond && reopened
        val maxTo = h.sc(id) + st
        val minTo = minOf(h.currentBet + h.lfr, maxTo)
        val why = when {
            canRaise -> null
            st <= o -> "You don't have enough chips to raise — calling puts you all-in."
            !othersCanRespond -> "Everyone else is all-in, so there's nobody left to raise against."
            else -> {
                val who = h.lastShortAllIn?.let { name(it) } ?: "The last all-in"
                "$who's all-in was smaller than a full raise, so betting isn't reopened for you. You can only call or fold."
            }
        }
        return Legal(
            canCheck = o == 0, canCall = o > 0, call = minOf(o, st),
            canRaise = canRaise, minTo = minTo, maxTo = maxTo,
            isBet = h.currentBet == 0, noRaiseWhy = why,
        )
    }

    private fun act(e: Event.Act) {
        val h = hand ?: throw RuleError("No hand in progress")
        if (!h.betting) throw RuleError("Betting is over for this hand")
        if (h.toAct != e.id) throw RuleError("It's ${h.toAct?.let { name(it) } ?: "nobody"}'s turn")
        val p = seated(e.id)
        val l = legal(e.id)
        val text: String
        val kind: String
        var amount = 0
        var by = 0
        when (e.move) {
            Move.FOLD -> {
                h.folded.add(p.id)
                text = "${p.name} folds."; kind = "fold"
                h.label[p.id] = "Fold"
            }
            Move.CHECK -> {
                if (!l.canCheck) throw RuleError("${p.name} can't check — there's a bet of ${fmt(h.currentBet)}")
                text = "${p.name} checks."; kind = "check"
                h.label[p.id] = "Check"
            }
            Move.CALL -> {
                if (!l.canCall) throw RuleError("Nothing to call — ${p.name} can check")
                pay(h, p, l.call)
                amount = l.call
                if (p.stack == 0) {
                    text = "${p.name} calls ${fmt(l.call)} and is all-in."; kind = "allin"
                    h.label[p.id] = "All-in"
                } else {
                    text = "${p.name} calls ${fmt(l.call)}."; kind = "call"
                    h.label[p.id] = "Call ${fmt(l.call)}"
                }
            }
            Move.RAISE -> {
                if (!l.canRaise) throw RuleError(l.noRaiseWhy ?: "Can't raise now")
                val to = e.to
                if (to > l.maxTo) throw RuleError("${p.name} only has ${fmt(l.maxTo)} in total")
                if (to < l.minTo) throw RuleError("Minimum ${if (l.isBet) "bet" else "raise"} is ${fmt(l.minTo)}")
                val wasBet = h.currentBet
                pay(h, p, to - h.sc(p.id))
                val inc = to - wasBet
                amount = to; by = maxOf(0, inc)
                if (inc >= h.lfr) h.lfr = inc else h.lastShortAllIn = p.id
                h.currentBet = maxOf(h.currentBet, to)
                if (h.street == Street.RIVER) h.riverAggressor = p.id
                val verb = if (l.isBet) "bets" else "raises to"
                if (p.stack == 0) {
                    text = "${p.name} is all-in for ${fmt(to)}${if (inc < h.lfr) " (less than a full raise)" else ""}."
                    kind = "allin"; h.label[p.id] = "All-in"
                } else {
                    text = "${p.name} $verb ${fmt(to)}."; kind = if (l.isBet) "bet" else "raise"
                    h.label[p.id] = if (l.isBet) "Bet ${fmt(to)}" else "Raise ${fmt(to)}"
                }
            }
        }
        h.acted[p.id] = h.currentBet
        h.streetActions++
        say(text, kind, p.id, h.label[p.id], amount, by)
        if (h.live.size == 1) { endRound(h); return }
        val next = nextNeeding(h, p.id)
        if (next == null) endRound(h) else h.toAct = next
    }

    private fun pay(h: Hand, p: Player, amount: Int) {
        p.stack -= amount
        h.sc[p.id] = h.sc(p.id) + amount
        h.tc[p.id] = h.tc(p.id) + amount
    }

    private fun endRound(h: Hand) {
        h.toAct = null
        // Uncalled bet goes back (TDA 16-B).
        val bySc = h.dealt.sortedByDescending { h.sc(it) }
        if (bySc.isNotEmpty()) {
            val top = bySc[0]
            val second = bySc.getOrNull(1)?.let { h.sc(it) } ?: 0
            val back = h.sc(top) - second
            if (back > 0) {
                h.sc[top] = h.sc(top) - back
                h.tc[top] = h.tc(top) - back
                seated(top).stack += back
                if (h.live.size > 1) say("${fmt(back)} uncalled — returned to ${name(top)}.", "return", top)
            }
        }
        h.sc.clear()
        val live = h.live
        if (live.size > 1 && (h.street == Street.RIVER || live.count { stack(it) > 0 } <= 1)) {
            for (id in live) if (h.label[id] != "All-in") h.label.remove(id)
        }
        if (live.size == 1) { winUncontested(h, live[0]); return }
        val canAct = live.count { stack(it) > 0 }
        if (canAct <= 1 && h.street != Street.RIVER) {
            h.runoutFrom = h.street
            h.street = Street.SHOWDOWN
            say("All-in — no more betting. Deal the rest of the board, then show cards.", "runout")
            return
        }
        if (h.street == Street.RIVER) {
            h.street = Street.SHOWDOWN
            say("Showdown — ${name(showFirst(h))} shows first.", "showdown")
            return
        }
        h.street = Street.entries[h.street.ordinal + 1]
        h.acted.clear(); h.label.clear()
        h.currentBet = 0; h.lfr = h.bb; h.streetActions = 0; h.lastShortAllIn = null
        say(when (h.street) {
            Street.FLOP -> "The Flop."
            Street.TURN -> "The Turn."
            else -> "The River."
        }, "street")
        h.toAct = nextNeeding(h, h.button)
        if (h.toAct == null) endRound(h)
    }

    /** Who should table their cards first at showdown (guidance only). */
    fun showFirst(h: Hand): Int {
        h.riverAggressor?.takeIf { it !in h.folded }?.let { return it }
        val d = h.dealt
        val start = d.indexOf(h.button)
        for (k in 1..d.size) {
            val c = d[(start + k) % d.size]
            if (c !in h.folded) return c
        }
        return h.live.first()
    }

    private fun winUncontested(h: Hand, w: Int) {
        val total = h.dealt.sumOf { h.tc(it) }
        seated(w).stack += total
        h.results = listOf(PotResult(total, listOf(w), listOf(w), mapOf(w to total)))
        h.street = Street.DONE
        say("${name(w)} wins ${fmt(total)} — everyone else folded.", "win", w, amount = total)
        finishHand(h)
    }

    // ---------------------------------------------------------------- board

    /** How many board cards are face up by now. */
    fun boardReached(h: Hand): Int = when (h.street) {
        Street.PREFLOP -> 0
        Street.FLOP -> 3
        Street.TURN -> 4
        else -> 5
    }

    private fun board(cards: List<Int>) {
        val h = hand ?: throw RuleError("No hand in progress")
        if (!h.open) throw RuleError("This hand is over")
        val max = boardReached(h)
        if (max == 0) throw RuleError("No board cards yet — the flop comes after this betting round")
        if (cards.size > max) throw RuleError("Only $max board card${if (max > 1) "s are" else " is"} out so far")
        if (cards.any { it !in 0..51 }) throw RuleError("Unknown card")
        if (cards.size != cards.toSet().size) throw RuleError("The same card is entered twice")
        val old = h.board
        if (cards == old) return
        h.board = cards
        val names = listOf("Flop", "Turn", "River")
        val grew = cards.size > old.size && cards.take(old.size) == old
        val text = when {
            cards.isEmpty() -> "Board cards cleared"
            grew && old.size >= 3 && cards.size - old.size == 1 -> names[cards.size - 3] + ": " + Cards.pretty(cards.takeLast(1))
            grew -> "Board: " + Cards.pretty(cards)
            else -> "Board corrected: " + Cards.pretty(cards)
        }
        say("$text.", "board")
    }

    // ---------------------------------------------------------------- showdown

    fun pots(h: Hand, collectedOnly: Boolean = false): List<Pot> {
        fun c(id: Int) = if (collectedOnly) h.tc(id) - h.sc(id) else h.tc(id)
        val levels = h.live.map { c(it) }.filter { it > 0 }.distinct().sorted()
        val pots = ArrayList<Pot>()
        var prev = 0
        for (lv in levels) {
            val amount = h.dealt.sumOf { maxOf(0, minOf(c(it), lv) - prev) }
            val eligible = h.live.filter { c(it) >= lv }
            if (amount > 0) {
                val last = pots.lastOrNull()
                if (last != null && last.eligible == eligible) pots[pots.size - 1] = last.copy(amount = last.amount + amount)
                else pots.add(Pot(amount, eligible))
            }
            prev = lv
        }
        val dead = h.dealt.sumOf { maxOf(0, c(it) - prev) }
        if (dead > 0) {
            if (pots.isEmpty()) pots.add(Pot(dead, h.live)) else pots[pots.size - 1] = pots.last().let { it.copy(amount = it.amount + dead) }
        }
        return pots
    }

    /** Smallest chip used for odd-chip splits: the largest standard chip that divides both blinds. */
    private fun unit(h: Hand): Int = intArrayOf(1000, 500, 100, 25, 5, 1).first { h.sb % it == 0 && h.bb % it == 0 }

    /** Players ordered clockwise starting left of the button (odd-chip order). */
    private fun fromButton(h: Hand, ids: Collection<Int>): List<Int> {
        val d = h.dealt
        val start = d.indexOf(h.button)
        return (1..d.size).map { d[(start + it) % d.size] }.filter { it in ids }
    }

    private fun award(e: Event.Award) {
        val h = hand ?: throw RuleError("No hand in progress")
        if (h.street != Street.SHOWDOWN) throw RuleError("Not at showdown yet")
        val ranked = e.ranking.flatten()
        if (ranked.isEmpty()) throw RuleError("Pick at least one winner")
        if (ranked.size != ranked.toSet().size) throw RuleError("A player is listed twice")
        ranked.forEach { if (it !in h.live) throw RuleError("${name(it)} isn't in the showdown") }
        val pots = pots(h)
        val u = unit(h)
        val results = pots.mapIndexed { i, pot ->
            val group = if (pot.eligible.size == 1) pot.eligible else e.ranking.firstOrNull { g -> g.any { it in pot.eligible } }
                ?: throw RuleError("Pick a winner for ${potName(i, pots.size)} (${pot.eligible.joinToString { name(it) }})")
            val winners = fromButton(h, group.filter { it in pot.eligible })
            val n = winners.size
            val per = pot.amount / (n * u) * u
            var rest = pot.amount - per * n
            val shares = LinkedHashMap<Int, Int>()
            winners.forEach { shares[it] = per }
            var k = 0
            while (rest > 0) {
                val c = minOf(u, rest)
                shares[winners[k % n]] = shares.getValue(winners[k % n]) + c
                rest -= c; k++
            }
            PotResult(pot.amount, pot.eligible, winners, shares)
        }
        for (r in results) for ((id, a) in r.shares) seated(id).stack += a
        h.results = results
        if (e.board.isNotEmpty()) {
            if (e.board != h.board) say("Board: ${Cards.pretty(e.board)}.", "board")
            h.board = e.board
        }
        h.holes = e.holes
        h.street = Street.DONE
        val scores = if (h.board.size == 5) e.holes.mapValues { (_, c) -> Eval.score((c + h.board).toIntArray()) } else emptyMap()
        for ((id, c) in e.holes) {
            val sc = scores[id]
            say("${name(id)} shows ${Cards.pretty(c)}${sc?.let { " (${Eval.describe(it).removePrefix("a ")})" } ?: ""}.", "show", id)
        }
        results.forEachIndexed { i, r ->
            val who = r.winners.joinToString(" and ") { name(it) }
            val title = potName(i, results.size).replaceFirstChar { it.uppercase() }
            val prefix = if (results.size > 1) "$title (${fmt(r.amount)}): " else ""
            val verb = if (r.winners.size > 1) "split ${fmt(r.amount)}" else "wins ${fmt(r.amount)}"
            val hand = r.winners.first().let { w -> scores[w]?.let { " with ${Eval.describe(it)}" } } ?: ""
            say("$prefix$who $verb$hand.", "win", r.winners.first(), amount = r.amount)
            val w = r.winners.first()
            val ws = scores[w]
            if (ws != null) {
                val losers = r.eligible.filter { it !in r.winners && scores[it] != null }.sortedByDescending { scores.getValue(it) }
                val l = losers.firstOrNull()
                if (l != null) say(Eval.whyBeats(name(w), ws, name(l), scores.getValue(l)), "why", w)
                else if (r.winners.size > 1) say("Same five cards — the pot is split.", "why", w)
            }
        }
        finishHand(h)
    }

    private fun potName(i: Int, n: Int) = if (n == 1) "the pot" else if (i == 0) "main pot" else "side pot $i"

    private fun finishHand(h: Hand) {
        for (id in h.dealt) {
            val p = seated(id)
            if (p.stack == 0) say("${p.name} is out of chips.", "bust", id)
        }
    }

    // ---------------------------------------------------------------- invariants

    /** Throws IllegalStateException if chips were created or destroyed. */
    fun checkInvariants() {
        val h = hand
        val inPlay = players.sumOf { it.stack } + (if (h != null && h.open) h.dealt.sumOf { h.tc(it) } else 0)
        val expected = (players + departed).sumOf { it.buyIn + it.adjust } - departed.sumOf { it.stack }
        check(inPlay == expected) { "Chip conservation broken: $inPlay in play, expected $expected" }
        players.forEach { check(it.stack >= 0) { "Negative stack for ${it.name}" } }
        if (h != null && h.betting) {
            for (id in h.live) if (stack(id) > 0) check(h.sc(id) <= h.currentBet) { "sc above currentBet" }
            check(h.lfr >= h.bb) { "lfr below big blind" }
            h.toAct?.let { check(needsAction(h, it)) { "toAct doesn't need action" } }
        }
    }

    companion object {
        const val MAX_PLAYERS = 10
        fun fmt(n: Int): String = String.format(java.util.Locale.US, "%,d", n)
    }
}
