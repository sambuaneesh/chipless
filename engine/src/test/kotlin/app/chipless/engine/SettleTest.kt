package app.chipless.engine

import kotlin.test.Test
import kotlin.test.assertEquals

class SettleTest {
    private fun check(bal: Map<Int, Long>, t: List<Settle.Transfer>) {
        val net = HashMap<Int, Long>()
        for (x in t) { net.merge(x.from, -x.amount, Long::plus); net.merge(x.to, x.amount, Long::plus) }
        assertEquals(bal.filterValues { it != 0L }, net.filterValues { it != 0L })
    }

    @Test
    fun exactBeatsGreedyOnWorkedExample() {
        val bal = mapOf(1 to 10L, 2 to -10L, 3 to 20L, 4 to -20L, 5 to 35L, 6 to -5L, 7 to -30L)
        val t = Settle.minimal(bal)
        check(bal, t)
        assertEquals(4, t.size)
    }

    @Test
    fun randomBalancesSettleExactly() {
        val rnd = java.util.Random(1)
        repeat(500) {
            val n = 2 + rnd.nextInt(9)
            val v = LongArray(n) { (rnd.nextInt(41) - 20).toLong() * 50 }
            v[n - 1] = -v.take(n - 1).sum()
            val bal = v.withIndex().associate { it.index to it.value }
            val t = Settle.minimal(bal)
            check(bal, t)
            assert(t.size <= Settle.greedy(bal).size)
        }
    }

    @Test
    fun moneyConversionStaysBalanced() {
        val m = Settle.toMoney(mapOf(1 to 333L, 2 to 333L, 3 to -666L), 1000, 3000)
        assertEquals(0L, m.values.sum())
    }
}
