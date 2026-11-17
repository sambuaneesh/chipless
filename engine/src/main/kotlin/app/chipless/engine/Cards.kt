package app.chipless.engine

/**
 * Cards are ints: rank * 4 + suit. Rank 0..12 = 2..A, suit 0..3 = s, h, d, c.
 * Text form is two characters, e.g. "As", "Td", "9h".
 */
object Cards {
    private const val RANKS = "23456789TJQKA"
    private const val SUITS = "shdc"

    fun parse(s: String): Int {
        require(s.length == 2) { "Bad card: $s" }
        val r = RANKS.indexOf(s[0].uppercaseChar())
        val su = SUITS.indexOf(s[1].lowercaseChar())
        require(r >= 0 && su >= 0) { "Bad card: $s" }
        return r * 4 + su
    }

    fun text(c: Int): String = "${RANKS[c shr 2]}${SUITS[c and 3]}"

    fun rankName(r: Int, plural: Boolean = false): String {
        val n = RANK_NAMES[r]
        return if (!plural) n else if (n == "Six") "Sixes" else n + "s"
    }

    private val RANK_NAMES = arrayOf(
        "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace",
    )
}

/**
 * Table-free 7-card evaluator (see docs/research/rules.md §6).
 * Score = cat << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5. Bigger wins, equal ties.
 */
object Eval {
    const val HIGH = 0; const val PAIR = 1; const val TWO_PAIR = 2; const val TRIPS = 3; const val STRAIGHT = 4
    const val FLUSH = 5; const val FULL_HOUSE = 6; const val QUADS = 7; const val STRAIGHT_FLUSH = 8

    fun score(cards: IntArray): Int {
        require(cards.size in 5..7)
        val cnt = IntArray(13)
        val sm = IntArray(4)
        var all = 0
        for (c in cards) {
            val r = c shr 2
            cnt[r]++
            sm[c and 3] = sm[c and 3] or (1 shl r)
            all = all or (1 shl r)
        }
        for (m in sm) if (Integer.bitCount(m) >= 5) {
            val sf = straightHi(m)
            return if (sf >= 0) pack(STRAIGHT_FLUSH, sf) else pack(FLUSH, *top(m, 5))
        }
        val q = ArrayList<Int>(1); val t = ArrayList<Int>(2); val p = ArrayList<Int>(3)
        for (r in 12 downTo 0) when (cnt[r]) { 4 -> q.add(r); 3 -> t.add(r); 2 -> p.add(r) }
        if (q.isNotEmpty()) return pack(QUADS, q[0], *top(all and (1 shl q[0]).inv(), 1))
        if (t.isNotEmpty() && (t.size > 1 || p.isNotEmpty())) {
            return pack(FULL_HOUSE, t[0], maxOf(t.getOrElse(1) { -1 }, p.getOrElse(0) { -1 }))
        }
        val st = straightHi(all)
        if (st >= 0) return pack(STRAIGHT, st)
        if (t.isNotEmpty()) return pack(TRIPS, t[0], *top(all and (1 shl t[0]).inv(), 2))
        if (p.size >= 2) return pack(TWO_PAIR, p[0], p[1], *top(all and (1 shl p[0]).inv() and (1 shl p[1]).inv(), 1))
        if (p.isNotEmpty()) return pack(PAIR, p[0], *top(all and (1 shl p[0]).inv(), 3))
        return pack(HIGH, *top(all, 5))
    }

    /** Highest straight top rank in a 13-bit mask, or -1. The wheel returns 3 (Five). */
    private fun straightHi(m: Int): Int {
        for (hi in 12 downTo 4) {
            val w = 0x1F shl (hi - 4)
            if (m and w == w) return hi
        }
        return if (m and 0x100F == 0x100F) 3 else -1
    }

    private fun top(m: Int, n: Int): IntArray {
        val o = IntArray(n); var k = 0
        var r = 12
        while (r >= 0 && k < n) { if ((m shr r) and 1 == 1) o[k++] = r; r-- }
        return o
    }

    private fun pack(cat: Int, vararg ks: Int): Int {
        var s = cat
        for (i in 0 until 5) s = (s shl 4) or (ks.getOrElse(i) { 0 })
        return s
    }

    fun category(score: Int) = score shr 20
    fun key(score: Int, i: Int) = (score shr (16 - 4 * i)) and 15

    /** The five cards that make the best hand (first matching 5-subset). */
    fun bestFive(cards: IntArray): IntArray {
        val best = score(cards)
        if (cards.size == 5) return cards.copyOf()
        val n = cards.size
        val pick = IntArray(5)
        fun rec(start: Int, depth: Int): Boolean {
            if (depth == 5) return score(pick) == best
            for (i in start..n - (5 - depth)) {
                pick[depth] = cards[i]
                if (rec(i + 1, depth + 1)) return true
            }
            return false
        }
        check(rec(0, 0))
        return pick.sortedByDescending { it shr 2 }.toIntArray()
    }

    fun describe(score: Int): String {
        val k1 = key(score, 0); val k2 = key(score, 1)
        return when (category(score)) {
            STRAIGHT_FLUSH -> if (k1 == 12) "a Royal Flush" else "a Straight Flush, ${Cards.rankName(k1)}-high"
            QUADS -> "Four ${Cards.rankName(k1, true)}"
            FULL_HOUSE -> "a Full House, ${Cards.rankName(k1, true)} full of ${Cards.rankName(k2, true)}"
            FLUSH -> "a Flush, ${Cards.rankName(k1)}-high"
            STRAIGHT -> if (k1 == 3) "a Straight, Five-high" else "a Straight, ${Cards.rankName(k1)}-high"
            TRIPS -> "Three ${Cards.rankName(k1, true)}"
            TWO_PAIR -> "Two Pair, ${Cards.rankName(k1, true)} and ${Cards.rankName(k2, true)}"
            PAIR -> "a Pair of ${Cards.rankName(k1, true)}"
            else -> "${Cards.rankName(k1)}-high"
        }
    }

    /** Short category label for UI chips. */
    fun categoryName(score: Int): String = arrayOf(
        "High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush",
    )[category(score)]

    private val KEY_COUNT = intArrayOf(5, 1, 2, 1, 1, 5, 2, 1, 1)

    /** One sentence on why [w] beats [l] (names given), assuming score(w) > score(l). */
    fun whyBeats(wName: String, w: Int, lName: String, l: Int): String {
        if (category(w) != category(l)) {
            return "$wName's ${describe(w).removePrefix("a ")} beats $lName's ${describe(l).removePrefix("a ")}."
        }
        val cat = category(w)
        var i = 0
        while (i < 5 && key(w, i) == key(l, i)) i++
        if (i >= 5) return "Same hand — split."
        val kc = KEY_COUNT[cat]
        val same = describe(w)
        return if (cat == FLUSH || cat == HIGH) {
            if (i == 0) "$wName's ${describe(w).removePrefix("a ")} beats $lName's ${describe(l).removePrefix("a ")}."
            else {
                val base = if (cat == FLUSH) "a Flush, ${Cards.rankName(key(w, 0))}-high" else "${Cards.rankName(key(w, 0))}-high"
                "Both have $base — the ${ordinal(i + 1)} card decides: " +
                    "$wName's ${Cards.rankName(key(w, i))} beats $lName's ${Cards.rankName(key(l, i))}."
            }
        } else if (i < kc) {
            "$wName's ${describe(w).removePrefix("a ")} beats $lName's ${describe(l).removePrefix("a ")}."
        } else {
            "Both have $same — $wName's ${Cards.rankName(key(w, i))} kicker beats $lName's ${Cards.rankName(key(l, i))}."
        }
    }

    private fun ordinal(n: Int) = when (n) { 2 -> "2nd"; 3 -> "3rd"; else -> "${n}th" }
}
