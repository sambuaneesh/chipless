package app.chipless.server

import app.chipless.engine.Cards
import app.chipless.engine.Coach
import app.chipless.engine.Entry
import app.chipless.engine.Eval
import app.chipless.engine.Event
import app.chipless.engine.Game
import app.chipless.engine.Hand
import app.chipless.engine.Move
import app.chipless.engine.RuleError
import app.chipless.engine.Settle
import app.chipless.engine.Street
import java.security.SecureRandom

/** Where the session is persisted (a file on Android, a temp file in dev, nothing in tests). */
interface Store {
    fun load(): String?
    fun save(data: String)
}

/** A connected client (browser tab or the host WebView). */
class Client(val loopback: Boolean, val send: (String) -> Unit) {
    @Volatile var host = false
    @Volatile var id: Int? = null
}

/** Table settings that are not part of the game log. */
class Config {
    var sb = 5
    var bb = 10
    var stack = 1000
    var mode = "free" // "free" | "money"
    var currency = "" // ISO code from CURRENCIES, or "" for plain numbers
    var money = 50_000L // minor units per buy-in of [stack] chips
    var decimals = 2
    var teach = "beginner" // "beginner" | "mixed" | "pro"
    var timer = false
    var minutes = 20

    fun toJson() = linkedMapOf<String, Any?>(
        "sb" to sb, "bb" to bb, "stack" to stack, "mode" to mode, "currency" to currency,
        "money" to money, "decimals" to decimals, "teach" to teach, "timer" to timer, "minutes" to minutes,
    )

    companion object {
        /** Must match CURRENCIES in web/src/fmt.ts. */
        val CURRENCIES = setOf("", "USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CNY", "KRW", "SGD", "AED", "CHF", "BRL", "MXN", "ZAR", "PHP", "NGN")
    }

    fun read(o: Obj) {
        sb = o.intOr("sb", sb); bb = o.intOr("bb", bb); stack = o.intOr("stack", stack)
        mode = o.strOr("mode", mode)!!.takeIf { it == "free" || it == "money" } ?: mode
        currency = o.strOr("currency", currency)?.takeIf { it in CURRENCIES } ?: currency
        money = o.longOr("money", money); decimals = o.intOr("decimals", decimals).coerceIn(0, 2)
        teach = o.strOr("teach", teach)!!.takeIf { it in setOf("beginner", "mixed", "pro") } ?: teach
        timer = o.bool("timer", timer); minutes = o.intOr("minutes", minutes).coerceIn(1, 120)
        if (sb <= 0 || bb < sb) throw RuleError("Blinds must be positive, big ≥ small")
        if (stack <= 0) throw RuleError("Starting stack must be more than 0")
        if (money < 0) throw RuleError("Buy-in can't be negative")
    }
}

/**
 * One poker night: config + event log + derived game. All public entry points are
 * synchronized; the server calls [handle] from connection threads.
 */
class Session(private val store: Store? = null, private val clock: () -> Long = System::currentTimeMillis) {
    private val rnd = SecureRandom()
    var hostToken: String = token()
        private set
    val cfg = Config()
    private val events = ArrayList<Event>()
    var game = Game()
        private set
    private val seats = HashMap<String, Int>()
    private var ended = false
    private var seq = 0L
    private var notice: String? = null

    // Blind timer
    private var level = 0
    private var levelEndsAt = 0L
    private var levelLeft = 0L
    private var timerRunning = false

    // Networking (set by the platform)
    private var lanOpen = false
    private var lanUrls: List<String> = emptyList()
    var onLan: ((Boolean) -> Unit)? = null

    private val clients = LinkedHashSet<Client>()
    private val lastSeen = HashMap<Int, Long>()

    init {
        store?.load()?.let { runCatching { restore(Json.parse(it) as Obj) } }
    }

    private fun token(): String = ByteArray(12).also(rnd::nextBytes).joinToString("") { "%02x".format(it) }

    // ------------------------------------------------------------------ clients

    @Synchronized fun connect(c: Client) { clients.add(c) }

    @Synchronized fun disconnect(c: Client) {
        if (clients.remove(c)) {
            c.id?.let { lastSeen[it] = clock() }
            broadcast()
        }
    }

    @Synchronized fun setLan(open: Boolean, urls: List<String>) {
        lanOpen = open; lanUrls = urls
        broadcast()
    }

    @Synchronized fun handle(c: Client, raw: String) {
        val m = try {
            Json.parse(raw) as? Obj ?: return
        } catch (e: IllegalArgumentException) {
            return c.send(error("Bad message"))
        }
        try {
            when (m.str("t")) {
                "hello" -> hello(c, m)
                "ping" -> c.send("""{"t":"pong"}""")
                "claim" -> claim(c, m.int("id"))
                "join" -> join(c, m.str("name"))
                "leave" -> { seats.entries.removeIf { it.value == c.id }; c.id = null; welcome(c); broadcast() }
                "act" -> act(c, m)
                "undo" -> undo(c, m)
                "eval" -> c.send(Json.write(mapOf("t" to "eval", "r" to evaluate(m))))
                "export" -> c.send(Json.write(exportMessage(c.host)))
                "cmd" -> {
                    if (!c.host) throw RuleError("Only the host can do that")
                    command(m)
                }
                else -> throw RuleError("Unknown message")
            }
        } catch (e: RuleError) {
            c.send(error(e.message ?: "Not allowed"))
        } catch (e: IllegalArgumentException) {
            c.send(error(e.message ?: "Bad request"))
        } catch (e: IllegalStateException) {
            c.send(error(e.message ?: "Something went wrong"))
        }
    }

    private fun error(msg: String, stale: Boolean = false) =
        Json.write(mapOf("t" to "error", "msg" to msg, "stale" to stale))

    private fun hello(c: Client, m: Obj) {
        if (c.loopback && m.strOr("host", null) == hostToken) c.host = true
        m.strOr("seat", null)?.let { t -> seats[t]?.takeIf { id -> game.players.any { it.id == id } }?.let { c.id = it } }
        welcome(c)
        c.send(stateMessage())
        broadcast()
    }

    private fun welcome(c: Client) {
        c.send(Json.write(mapOf("t" to "welcome", "role" to if (c.host) "host" else if (c.id != null) "player" else "guest", "id" to c.id)))
    }

    private fun issueSeat(c: Client, id: Int) {
        seats.entries.removeIf { it.value == id }
        for (o in clients) if (o !== c && o.id == id && !o.host) { o.id = null; welcome(o) }
        val t = token()
        seats[t] = id
        c.id = id
        c.send(Json.write(mapOf("t" to "seat", "token" to t, "id" to id)))
        welcome(c)
        save()
        broadcast()
    }

    private fun claim(c: Client, id: Int) {
        game.seated(id)
        issueSeat(c, id)
    }

    private fun join(c: Client, name: String) {
        if (!game.created || ended) throw RuleError("The table isn't open yet. Wait for the host to start.")
        push(Event.AddPlayer(name, cfg.stack, game.players.size, Entry.POST))
        issueSeat(c, game.players.last().id)
    }

    // ------------------------------------------------------------------ game changes

    private fun rebuild() {
        val g = Game()
        for (e in events) g.apply(e)
        game = g
    }

    private fun push(e: Event) {
        try {
            game.apply(e)
            game.checkInvariants()
        } catch (x: Exception) {
            rebuild()
            if (x is RuleError) throw x
            throw IllegalStateException("That didn't work (${x.message}). Nothing was changed.")
        }
        events.add(e)
        notice = null
        changed()
    }

    private fun changed() {
        seq++
        save()
        broadcast()
    }

    private fun checkSeq(m: Obj) {
        val s = m.longOr("seq", -1)
        if (s != -1L && s != seq) throw RuleError("The table just changed. Check and try again.")
    }

    private fun act(c: Client, m: Obj) {
        val id = m.int("id")
        if (!c.host && c.id != id) throw RuleError("You can only act for yourself")
        checkSeq(m)
        val move = runCatching { Move.valueOf(m.str("move").uppercase()) }.getOrElse { throw RuleError("Unknown move") }
        push(Event.Act(id, move, m.intOr("to", 0)))
    }

    private fun undoable(by: Client?): Boolean {
        val last = events.lastOrNull() ?: return false
        if (last is Event.Create) return false
        if (by == null || by.host) return true
        return last is Event.Act && last.id == by.id
    }

    private fun undo(c: Client, m: Obj) {
        checkSeq(m)
        if (!undoable(c)) throw RuleError(if (c.host) "Nothing to undo" else "You can undo only your own last action, before anyone else acts")
        val oldLog = game.log.toList()
        events.removeAt(events.size - 1)
        rebuild()
        notice = "Undone: " + (oldLog.drop(game.log.size).firstOrNull()?.text ?: "last change")
        changed()
    }

    // ------------------------------------------------------------------ host commands

    private fun command(m: Obj) {
        when (m.str("c")) {
            "setup" -> {
                val names = m.strs("names")
                cfg.read(m)
                events.clear(); seats.clear(); ended = false; game = Game(); notice = null
                level = 0; levelEndsAt = 0; levelLeft = cfg.minutes * 60_000L; timerRunning = false
                for (c in clients) if (!c.host) { c.id = null; welcome(c) }
                val button = m.intOr("button", -1).let { if (it in names.indices) it else rnd.nextInt(maxOf(1, names.size)) }
                try {
                    push(Event.Create(names, cfg.stack, button))
                } catch (e: RuleError) {
                    events.clear(); game = Game(); changed(); throw e
                }
            }
            "deal" -> {
                if (ended) throw RuleError("The game has ended. Reopen it to keep playing.")
                val (sb, bb) = blindsForNextHand()
                push(Event.StartHand(sb, bb))
                if (cfg.timer && !timerRunning && levelEndsAt == 0L) startTimer()
            }
            "board" -> push(Event.Board(parseCards(m.list("cards"))))
            "import" -> importBackup(m.obj("data"))
            "close" -> {
                events.clear(); seats.clear(); ended = false; game = Game(); notice = null; timerRunning = false
                for (c in clients) if (!c.host) { c.id = null; welcome(c) }
                changed()
                onLan?.invoke(false)
            }
            "award" -> push(Event.Award(m.list("ranking").map { g -> (g as List<*>).map { (it as Number).toInt() } }))
            "awardCards" -> awardCards(m)
            "add" -> push(Event.AddPlayer(m.str("name"), m.intOr("stack", cfg.stack), m.intOr("index", game.players.size), entry(m)))
            "remove" -> {
                push(Event.RemovePlayer(m.int("id")))
                seats.entries.removeIf { it.value == m.int("id") }
            }
            "sitout" -> push(Event.SitOut(m.int("id")))
            "sitin" -> push(Event.SitIn(m.int("id"), entry(m)))
            "rebuy" -> push(Event.Rebuy(m.int("id"), m.intOr("chips", cfg.stack)))
            "adjust" -> push(Event.Adjust(m.int("id"), m.int("stack")))
            "rename" -> push(Event.Rename(m.int("id"), m.str("name")))
            "reorder" -> push(Event.Reorder(m.ints("ids")))
            "button" -> push(Event.SetButton(m.int("id")))
            "settings" -> {
                val wasTimer = cfg.timer
                cfg.read(m)
                if (cfg.timer && !wasTimer) { level = 0; levelEndsAt = 0; levelLeft = cfg.minutes * 60_000L; timerRunning = false }
                changed()
            }
            "timer" -> {
                when (m.str("do")) {
                    "pause" -> if (timerRunning) { levelLeft = maxOf(0, levelEndsAt - clock()); timerRunning = false }
                    "resume" -> if (!timerRunning) { levelEndsAt = clock() + levelLeft; timerRunning = true }
                    "next" -> { level = minOf(level + 1, LEVELS.lastIndex); levelLeft = cfg.minutes * 60_000L; levelEndsAt = clock() + levelLeft }
                    "prev" -> { level = maxOf(level - 1, 0); levelLeft = cfg.minutes * 60_000L; levelEndsAt = clock() + levelLeft }
                }
                changed()
            }
            "end" -> {
                if (game.inHand) throw RuleError("Finish this hand before ending the game")
                ended = true; timerRunning = false; changed()
            }
            "reopen" -> { ended = false; changed() }
            "reset" -> {
                events.clear(); seats.clear(); ended = false; game = Game(); notice = null; timerRunning = false
                for (c in clients) if (!c.host) { c.id = null; welcome(c) }
                changed()
            }
            "lan" -> onLan?.invoke(m.bool("open"))
            else -> throw RuleError("Unknown command")
        }
    }

    private fun entry(m: Obj) = runCatching { Entry.valueOf(m.strOr("entry", "POST")!!.uppercase()) }.getOrDefault(Entry.POST)

    // ------------------------------------------------------------------ blinds timer

    private fun startTimer() {
        level = 0; levelEndsAt = clock() + cfg.minutes * 60_000L; timerRunning = true
    }

    private fun levelBlinds(i: Int): Pair<Int, Int> {
        val bb = cfg.bb * LEVELS[i]
        return Pair(maxOf(1, cfg.sb * LEVELS[i]), bb)
    }

    private fun blindsForNextHand(): Pair<Int, Int> {
        if (!cfg.timer) return Pair(cfg.sb, cfg.bb)
        if (timerRunning) {
            while (clock() >= levelEndsAt && level < LEVELS.lastIndex) { level++; levelEndsAt += cfg.minutes * 60_000L }
        }
        return levelBlinds(level)
    }

    // ------------------------------------------------------------------ referee

    private fun parseCards(l: List<Any?>): List<Int> = l.map {
        try { Cards.parse(it as String) } catch (e: IllegalArgumentException) { throw RuleError("Unknown card: $it") }
    }

    private fun awardCards(m: Obj) {
        val h = game.hand ?: throw RuleError("No hand in progress")
        if (h.street != Street.SHOWDOWN) throw RuleError("Not at showdown yet")
        val board = parseCards(m.list("board"))
        if (board.size != 5) throw RuleError("Enter all 5 board cards")
        val holes = m.obj("holes").entries.associate { (k, v) -> k.toInt() to parseCards(v as List<*>) }
            .filterValues { it.isNotEmpty() }
        holes.forEach { (id, c) ->
            if (id !in h.live) throw RuleError("${game.player(id).name} isn't in the showdown")
            if (c.size != 2) throw RuleError("${game.player(id).name} needs 2 cards")
        }
        if (holes.isEmpty()) throw RuleError("Enter at least one player's cards")
        val all = board + holes.values.flatten()
        if (all.size != all.toSet().size) throw RuleError("The same card is entered twice")
        val scores = holes.mapValues { (_, c) -> Eval.score((c + board).toIntArray()) }
        val ranking = scores.entries.groupBy({ it.value }, { it.key }).toSortedMap(compareByDescending { it }).values.toList()
        push(Event.Award(ranking, board, holes))
    }

    private fun evaluate(m: Obj): Map<String, Any?> {
        val board = parseCards(m.list("board"))
        if (board.size !in 3..5) throw RuleError("Enter 3 to 5 board cards")
        val hands = m.list("hands").map { it as Obj }
        if (hands.size < 1) throw RuleError("Enter at least one hand")
        val parsed = hands.map { it.strOr("name", "?")!! to parseCards(it.list("cards")) }
        parsed.forEach { (n, c) -> if (c.size != 2) throw RuleError("$n needs 2 cards") }
        val all = board + parsed.flatMap { it.second }
        if (all.size != all.toSet().size) throw RuleError("The same card is entered twice")
        val scores = parsed.map { Eval.score((it.second + board).toIntArray()) }
        val best = scores.max()
        val winners = scores.indices.filter { scores[it] == best }
        val text = if (parsed.size == 1) "${parsed[0].first} has ${Eval.describe(best)}."
        else if (winners.size > 1) "Split pot: ${winners.joinToString(" and ") { parsed[it].first }} both have ${Eval.describe(best)}."
        else {
            val w = winners[0]
            val runner = scores.indices.filter { it != w }.maxBy { scores[it] }
            "${parsed[w].first} wins with ${Eval.describe(best)}. " + Eval.whyBeats(parsed[w].first, best, parsed[runner].first, scores[runner])
        }
        return mapOf(
            "hands" to parsed.mapIndexed { i, (n, c) ->
                mapOf(
                    "name" to n, "desc" to Eval.describe(scores[i]), "cat" to Eval.categoryName(scores[i]),
                    "best" to Eval.bestFive((c + board).toIntArray()).map(Cards::text),
                )
            },
            "winners" to winners, "text" to text, "final" to (board.size == 5),
        )
    }

    // ------------------------------------------------------------------ snapshot

    private fun broadcast() {
        val msg = stateMessage()
        for (c in clients) c.send(msg)
    }

    @Synchronized fun stateMessage(): String = Json.write(mapOf("t" to "state", "s" to snapshot()))

    private fun snapshot(): Map<String, Any?> {
        val g = game
        val h = g.hand
        val now = clock()
        val online = clients.mapNotNull { it.id }.toSet()
        val claimed = seats.values.toSet()
        val s = linkedMapOf<String, Any?>(
            "seq" to seq,
            "now" to now,
            "phase" to if (!g.created) "setup" else if (ended) "ended" else "play",
            "cfg" to cfg.toJson(),
            "lan" to mapOf("open" to lanOpen, "urls" to lanUrls),
            "handNo" to g.handNo,
            "button" to g.buttonId,
            "players" to g.players.mapIndexed { i, p ->
                mapOf(
                    "id" to p.id, "name" to p.name, "stack" to p.stack, "seat" to i,
                    "out" to p.sittingOut, "waiting" to p.waiting, "post" to p.post,
                    "buyIn" to p.buyIn, "net" to (p.stack + (h?.takeIf { it.open }?.tc(p.id) ?: 0) - p.buyIn),
                    "conn" to if (p.id in online) "on" else if (p.id in claimed) "off" else null,
                    "seen" to lastSeen[p.id],
                )
            },
            "departed" to g.departed.map { mapOf("id" to it.id, "name" to it.name, "stack" to it.stack, "buyIn" to it.buyIn) },
            "hand" to h?.let { handJson(g, it) },
            "prompt" to Coach.prompt(g),
            "cue" to Coach.cue(g),
            "hint" to Coach.hint(g)?.let { mapOf("key" to it.key, "text" to it.text) },
            "notice" to notice,
            "log" to g.log.takeLast(120).map {
                mapOf("h" to it.hand, "text" to it.text, "kind" to it.kind, "who" to it.who, "tag" to it.tag, "amt" to it.amount, "by" to it.by)
            },
            "undo" to mapOf("host" to undoable(null), "by" to (events.lastOrNull() as? Event.Act)?.id),
            "timer" to timerJson(now),
            "settle" to if (g.created) settleJson(g) else null,
        )
        return s
    }

    private fun timerJson(now: Long): Map<String, Any?>? {
        if (!cfg.timer) return null
        val (sb, bb) = levelBlinds(level)
        val (nsb, nbb) = levelBlinds(minOf(level + 1, LEVELS.lastIndex))
        val left = if (timerRunning) maxOf(0, levelEndsAt - now) else if (levelEndsAt == 0L) cfg.minutes * 60_000L else levelLeft
        return mapOf(
            "level" to level + 1, "sb" to sb, "bb" to bb, "nextSb" to nsb, "nextBb" to nbb,
            "running" to timerRunning, "left" to left, "endsAt" to if (timerRunning) levelEndsAt else null,
            "minutes" to cfg.minutes,
        )
    }

    private fun handJson(g: Game, h: Hand): Map<String, Any?> {
        val betting = h.betting
        val legal = h.toAct?.let { id ->
            val l = g.legal(id)
            mapOf(
                "id" to id, "canCheck" to l.canCheck, "canCall" to l.canCall, "call" to l.call,
                "canRaise" to l.canRaise, "minTo" to l.minTo, "maxTo" to l.maxTo, "isBet" to l.isBet,
                "why" to l.noRaiseWhy, "sc" to h.sc(id), "stack" to g.player(id).stack,
            )
        }
        val pots = if (betting) g.pots(h, collectedOnly = true) else if (h.open) g.pots(h) else emptyList()
        val scores = if (h.board.size == 5) h.holes.mapValues { (_, c) ->
            val sc = Eval.score((c + h.board).toIntArray())
            mapOf("desc" to Eval.describe(sc), "cat" to Eval.categoryName(sc), "best" to Eval.bestFive((c + h.board).toIntArray()).map(Cards::text), "cards" to c.map(Cards::text))
        } else emptyMap()
        return linkedMapOf(
            "no" to h.no, "street" to h.street.name.lowercase(), "button" to h.button, "sbId" to h.sbId, "bbId" to h.bbId,
            "sb" to h.sb, "bb" to h.bb, "dealt" to h.dealt, "folded" to h.folded.toList(),
            "toAct" to h.toAct, "currentBet" to h.currentBet, "lfr" to h.lfr,
            "bets" to h.dealt.filter { h.sc(it) > 0 }.associate { it.toString() to h.sc(it) },
            "total" to h.dealt.sumOf { h.tc(it) },
            "pots" to pots.map { mapOf("amount" to it.amount, "eligible" to it.eligible) },
            "labels" to h.label.mapKeys { it.key.toString() },
            "legal" to legal,
            "showFirst" to if (h.street == Street.SHOWDOWN) g.showFirst(h) else null,
            "runout" to h.runoutFrom?.name?.lowercase(),
            "results" to h.results.map { mapOf("amount" to it.amount, "winners" to it.winners, "shares" to it.shares.mapKeys { k -> k.key.toString() }) },
            "board" to h.board.map(Cards::text),
            "scores" to scores.mapKeys { it.key.toString() },
        )
    }

    private fun settleJson(g: Game): Map<String, Any?> {
        val everyone = g.players + g.departed
        val open = g.hand?.takeIf { it.open }
        val chips = everyone.associate { it.id to (it.stack + (open?.tc(it.id) ?: 0) - it.buyIn).toLong() }
        val totalIn = everyone.sumOf { it.buyIn.toLong() }
        val totalOut = everyone.sumOf { (it.stack + (open?.tc(it.id) ?: 0)).toLong() }
        val balanced = chips.values.sum() == 0L
        val money = if (cfg.mode == "money" && balanced) Settle.toMoney(chips, cfg.money, cfg.stack.toLong()) else null
        val basis = money ?: chips
        val transfers = if (balanced && ended) Settle.minimal(basis) else emptyList()
        return mapOf(
            "balanced" to balanced, "in" to totalIn, "out" to totalOut,
            "nets" to everyone.map { mapOf("id" to it.id, "name" to it.name, "chips" to chips[it.id], "money" to money?.get(it.id), "buyIn" to it.buyIn) },
            "transfers" to transfers.map { mapOf("from" to it.from, "to" to it.to, "amount" to it.amount) },
        )
    }

    // ------------------------------------------------------------------ export / import

    private fun stamp(): String = java.time.LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(clock()), java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd-HHmm"))

    /** A portable copy of the whole game, for continuing on another phone. */
    private fun backup(): Map<String, Any?> {
        val left = if (timerRunning) maxOf(0, levelEndsAt - clock()) else if (levelEndsAt == 0L) cfg.minutes * 60_000L else levelLeft
        return linkedMapOf(
            "app" to "chipless", "kind" to "backup", "v" to 1, "at" to clock(),
            "cfg" to cfg.toJson(), "ended" to ended, "events" to events.map(Codec::encode),
            "timer" to mapOf("level" to level, "left" to left, "running" to timerRunning, "started" to (levelEndsAt != 0L)),
        )
    }

    private fun exportMessage(host: Boolean): Map<String, Any?> {
        val st = stamp()
        val out = linkedMapOf<String, Any?>("t" to "export", "text" to Report.text(game, cfg, ended, clock()), "file" to "chipless-hands-$st.txt")
        if (host && game.created) {
            out["backup"] = Json.write(backup())
            out["backupFile"] = "chipless-backup-$st.json"
        }
        return out
    }

    /** Replace the table with a backup. Every event must replay cleanly, or nothing changes. */
    private fun importBackup(o: Obj) {
        if (o.strOr("app", null) != "chipless" || o.strOr("kind", null) != "backup") throw RuleError("That isn't a Chipless backup file")
        if (o.intOr("v", 0) > 1) throw RuleError("This backup is from a newer version of Chipless. Update the app first.")
        val c = Config().also { it.read(o.obj("cfg")) }
        val evs = try {
            o.list("events").map { Codec.decode(it as Obj) }
        } catch (e: Exception) {
            throw RuleError("The backup file is damaged")
        }
        val g = Game()
        try {
            for (e in evs) { g.apply(e); g.checkInvariants() }
        } catch (e: Exception) {
            throw RuleError("The backup doesn't replay cleanly (${e.message}). Nothing was changed.")
        }
        if (!g.created) throw RuleError("The backup has no game in it")
        cfg.read(o.obj("cfg"))
        events.clear(); events.addAll(evs)
        game = g
        ended = o.bool("ended")
        seats.clear()
        for (cl in clients) if (!cl.host) { cl.id = null; welcome(cl) }
        val t = o["timer"] as? Obj
        level = (t?.intOr("level", 0) ?: 0).coerceIn(0, LEVELS.lastIndex)
        levelLeft = t?.longOr("left", cfg.minutes * 60_000L) ?: (cfg.minutes * 60_000L)
        val started = t?.bool("started") ?: false
        timerRunning = cfg.timer && (t?.bool("running") ?: false)
        levelEndsAt = if (timerRunning) clock() + levelLeft else if (started) 1L else 0L
        notice = "Game restored from a backup: ${g.players.size} players, ${g.handNo} hand${if (g.handNo == 1) "" else "s"} played."
        changed()
    }

    // ------------------------------------------------------------------ persistence

    private fun save() {
        val s = store ?: return
        val data = mapOf(
            "v" to 1, "host" to hostToken, "cfg" to cfg.toJson(), "ended" to ended,
            "events" to events.map(Codec::encode), "seats" to seats,
            "timer" to mapOf("level" to level, "endsAt" to levelEndsAt, "left" to levelLeft, "running" to timerRunning),
        )
        runCatching { s.save(Json.write(data)) }
    }

    private fun restore(o: Obj) {
        hostToken = o.strOr("host", hostToken)!!
        cfg.read(o.obj("cfg"))
        ended = o.bool("ended")
        events.clear()
        for (e in o.list("events")) {
            val ev = Codec.decode(e as Obj)
            try { game.apply(ev); events.add(ev) } catch (x: Exception) { break }
        }
        (o["seats"] as? Obj)?.forEach { (k, v) -> seats[k] = (v as Number).toInt() }
        (o["timer"] as? Obj)?.let {
            level = it.intOr("level", 0); levelEndsAt = it.longOr("endsAt", 0); levelLeft = it.longOr("left", 0)
            timerRunning = it.bool("running")
        }
        seq = events.size.toLong()
    }

    @Synchronized fun hasGame() = game.created

    companion object {
        /** Big-blind multipliers per level (25/50, 50/100, 75/150, ... 4000/8000 from a 25/50 start). */
        val LEVELS = intArrayOf(1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 40, 60, 80, 120, 160)
    }
}
