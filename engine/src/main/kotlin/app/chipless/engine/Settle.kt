package app.chipless.engine

/** End-of-night settlement: who pays whom. Balances are integer minor units (cents, paise). */
object Settle {
    data class Transfer(val from: Int, val to: Int, val amount: Long)

    /**
     * Fewest transfers that settle [balances] (positive = is owed money, negative = owes).
     * Exact for up to 16 non-zero balances (subset DP over zero-sum groups), greedy beyond.
     */
    fun minimal(balances: Map<Int, Long>): List<Transfer> {
        require(balances.values.sum() == 0L) { "Balances don't sum to zero" }
        val ids = balances.filterValues { it != 0L }.keys.sortedBy { it }
        val n = ids.size
        if (n == 0) return emptyList()
        if (n > 16) return greedy(ids.associateWith { balances.getValue(it) })
        val v = ids.map { balances.getValue(it) }
        val full = (1 shl n) - 1
        val sum = LongArray(1 shl n)
        for (m in 1..full) {
            val low = Integer.numberOfTrailingZeros(m)
            sum[m] = sum[m and (m - 1)] + v[low]
        }
        val dp = IntArray(1 shl n)
        for (m in 1..full) {
            var best = 0
            var bits = m
            while (bits != 0) {
                val i = Integer.numberOfTrailingZeros(bits)
                bits = bits and (bits - 1)
                best = maxOf(best, dp[m xor (1 shl i)])
            }
            dp[m] = best + if (sum[m] == 0L) 1 else 0
        }
        // Walk back to split into zero-sum groups.
        val out = ArrayList<Transfer>()
        var m = full
        val group = ArrayList<Int>()
        while (m != 0) {
            val z = if (sum[m] == 0L) 1 else 0
            var bits = m
            var pick = -1
            while (bits != 0) {
                val i = Integer.numberOfTrailingZeros(bits)
                bits = bits and (bits - 1)
                if (dp[m xor (1 shl i)] + z == dp[m]) { pick = i; break }
            }
            group.add(pick)
            m = m xor (1 shl pick)
            if (sum[m] == 0L) {
                out += greedy(group.associate { ids[it] to v[it] })
                group.clear()
            }
        }
        return out
    }

    /** Largest debtor pays largest creditor until everyone is square. At most n-1 transfers. */
    fun greedy(balances: Map<Int, Long>): List<Transfer> {
        val bal = balances.filterValues { it != 0L }.toMutableMap()
        val out = ArrayList<Transfer>()
        while (bal.isNotEmpty()) {
            val debtor = bal.minBy { it.value }
            val creditor = bal.maxBy { it.value }
            val a = minOf(-debtor.value, creditor.value)
            out.add(Transfer(debtor.key, creditor.key, a))
            bal[debtor.key] = debtor.value + a
            bal[creditor.key] = creditor.value - a
            bal.entries.removeIf { it.value == 0L }
        }
        return out
    }

    /** Everyone settles with one banker (the host). */
    fun viaBank(balances: Map<Int, Long>, bank: Int): List<Transfer> =
        balances.filter { it.key != bank && it.value != 0L }.map { (id, b) ->
            if (b < 0) Transfer(id, bank, -b) else Transfer(bank, id, b)
        }

    /**
     * Convert chip results to money. [chips] = net chips per player (sums to 0).
     * Rounds each to the nearest minor unit and fixes the rounding drift so the total is exactly 0
     * (largest remainders absorb it), keeping settlement balanced.
     */
    fun toMoney(chips: Map<Int, Long>, moneyPerBuyIn: Long, chipsPerBuyIn: Long): Map<Int, Long> {
        require(chipsPerBuyIn > 0)
        val exact = chips.mapValues { (_, c) -> c.toDouble() * moneyPerBuyIn / chipsPerBuyIn }
        val rounded = exact.mapValues { Math.round(it.value) }.toMutableMap()
        var drift = rounded.values.sum()
        val order = exact.keys.sortedByDescending { if (drift > 0) rounded.getValue(it) - exact.getValue(it) else exact.getValue(it) - rounded.getValue(it) }
        var i = 0
        while (drift != 0L && order.isNotEmpty()) {
            val id = order[i % order.size]
            if (drift > 0) { rounded[id] = rounded.getValue(id) - 1; drift-- } else { rounded[id] = rounded.getValue(id) + 1; drift++ }
            i++
        }
        return rounded
    }
}
