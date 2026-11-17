package app.chipless.engine

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EvalTest {
    private fun s(vararg c: String) = Eval.score(c.map { Cards.parse(it) }.toIntArray())

    @Test
    fun allFiveCardHandsHaveStandardCategoryCountsAnd7462Classes() {
        val counts = IntArray(9)
        val distinct = HashSet<Int>()
        val h = IntArray(5)
        for (a in 0 until 52) for (b in a + 1 until 52) for (c in b + 1 until 52) for (d in c + 1 until 52) for (e in d + 1 until 52) {
            h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e
            val sc = Eval.score(h)
            counts[Eval.category(sc)]++
            distinct.add(sc)
        }
        assertEquals(listOf(1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40), counts.toList())
        assertEquals(7462, distinct.size)
    }

    @Test
    fun sevenCardScoreEqualsBestOfTwentyOneSubsets() {
        val rnd = java.util.Random(42)
        repeat(100_000) {
            val deck = (0 until 52).shuffled(rnd).take(7).toIntArray()
            var best = 0
            for (skipA in 0 until 7) for (skipB in skipA + 1 until 7) {
                val five = deck.filterIndexed { i, _ -> i != skipA && i != skipB }.toIntArray()
                best = maxOf(best, Eval.score(five))
            }
            assertEquals(best, Eval.score(deck))
            assertEquals(best, Eval.score(Eval.bestFive(deck)))
        }
    }

    @Test
    fun edgeCases() {
        assertEquals("a Straight, Five-high", Eval.describe(s("As", "2d", "3c", "4h", "5s", "Kd", "Kc")))
        assertTrue(s("As", "2d", "3c", "4h", "5s") < s("2s", "3d", "4c", "5h", "6s"))
        assertEquals("a Flush, King-high", Eval.describe(s("Kh", "9h", "7h", "4h", "2h", "Qs", "Js")))
        assertEquals("Two Pair, Kings and Queens", Eval.describe(s("Kh", "Kd", "Qh", "Qc", "7h", "7d", "2s")))
        assertEquals(s("Kh", "Kd", "Qh", "Qc", "7h", "7d", "Ac"), s("Ks", "Kc", "Qs", "Qd", "As", "2d", "3c"))
        assertEquals("a Full House, Nines full of Fours", Eval.describe(s("9h", "9d", "9c", "4h", "4d", "4c", "2s")))
        assertEquals("a Royal Flush", Eval.describe(s("Ah", "Kh", "Qh", "Jh", "Th", "2c", "3d")))
        assertEquals("a Pair of Sixes", Eval.describe(s("6h", "6d", "Ah", "Jc", "9d")))
        // Board plays: both split.
        assertEquals(s("2c", "3d", "Ah", "Kh", "Qh", "Jh", "Th"), s("4c", "5d", "Ah", "Kh", "Qh", "Jh", "Th"))
    }

    @Test
    fun explanations() {
        val w = s("Ah", "Ad", "Kc", "7s", "2d")
        val l = s("As", "Ac", "Qc", "7h", "2c")
        assertEquals("Both have a Pair of Aces — Ann's King kicker beats Bob's Queen.", Eval.whyBeats("Ann", w, "Bob", l))
        assertEquals(
            "Ann's Flush, Ace-high beats Bob's Straight, Ten-high.",
            Eval.whyBeats("Ann", s("Ah", "9h", "7h", "4h", "2h"), "Bob", s("6c", "7d", "8s", "9c", "Td")),
        )
    }
}
