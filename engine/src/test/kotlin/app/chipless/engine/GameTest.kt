package app.chipless.engine

import app.chipless.engine.Event.Act
import app.chipless.engine.Event.StartHand
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GameTest {
    /** Players P1..Pn (ids 1..n) with the given stacks; button on seat [button]. */
    private fun table(vararg stacks: Int, button: Int = 0): Game {
        val g = Game()
        g.apply(Event.Create(stacks.indices.map { "P${it + 1}" }, 1000, button))
        stacks.forEachIndexed { i, s -> if (s != 1000) g.apply(Event.Adjust(i + 1, s)) }
        return g
    }

    private fun Game.go(id: Int, move: Move, to: Int = 0) {
        apply(Act(id, move, to)); checkInvariants()
    }

    private val Game.h get() = hand!!

    @Test
    fun headsUpButtonPostsSmallBlindAndActsFirstPreflopLastPostflop() {
        val g = table(1000, 1000, button = 0)
        g.apply(StartHand(5, 10))
        assertEquals(1, g.h.button); assertEquals(1, g.h.sbId); assertEquals(2, g.h.bbId)
        assertEquals(1, g.h.toAct)
        g.go(1, Move.CALL)
        assertEquals(2, g.h.toAct) // BB option
        g.go(2, Move.CHECK)
        assertEquals(Street.FLOP, g.h.street)
        assertEquals(2, g.h.toAct) // BB first postflop
    }

    @Test
    fun foldAroundBigBlindWinsSmallBlind() {
        val g = table(1000, 1000, 1000, button = 0)
        g.apply(StartHand(5, 10)) // btn P1, SB P2, BB P3
        g.go(1, Move.FOLD); g.go(2, Move.FOLD)
        assertEquals(Street.DONE, g.h.street)
        assertEquals(1005, g.player(3).stack)
        assertEquals(995, g.player(2).stack)
    }

    @Test
    fun bigBlindOptionAfterLimps() {
        val g = table(1000, 1000, 1000, button = 0)
        g.apply(StartHand(5, 10))
        g.go(1, Move.CALL); g.go(2, Move.CALL)
        assertEquals(3, g.h.toAct)
        val l = g.legal(3)
        assertTrue(l.canCheck); assertTrue(l.canRaise); assertEquals(20, l.minTo)
    }

    /** Button on the last seat, SB P1, BB P2. Everyone limps to the flop except the button, who folds. */
    private fun toFlop(stacks: IntArray, sb: Int, bb: Int): Game {
        val n = stacks.size
        val g = table(*stacks, button = n - 1)
        g.apply(StartHand(sb, bb))
        for (id in 3 until n) g.go(id, Move.CALL)
        g.go(n, Move.FOLD); g.go(1, Move.CALL); g.go(2, Move.CHECK)
        assertEquals(Street.FLOP, g.h.street); assertEquals(1, g.h.toAct)
        return g
    }

    @Test
    fun example1ShortAllInDoesNotReopenForRaiser() {
        val g = toFlop(intArrayOf(1000, 1000, 260, 1000), 5, 10)
        g.go(1, Move.RAISE, 100)
        g.go(2, Move.RAISE, 200)
        g.go(3, Move.RAISE, 250) // all-in, +50 short
        assertTrue(g.legal(1).canRaise) // faced 150 >= 100
        g.go(1, Move.CALL)
        val l = g.legal(2)
        assertFalse(l.canRaise)
        assertTrue(l.canCall); assertEquals(50, l.call)
    }

    @Test
    fun example2CumulativeShortAllInsReopen() {
        val g = toFlop(intArrayOf(1000, 250, 300, 1000, 1000), 50, 100)
        g.go(1, Move.RAISE, 100)
        assertEquals(150, g.legal(2).minTo) // all-in only
        g.go(2, Move.RAISE, 150)
        g.go(3, Move.RAISE, 200)
        g.go(4, Move.CALL)
        assertEquals(Street.FLOP, g.h.street)
        assertEquals(1, g.h.toAct)
        val l = g.legal(1)
        assertTrue(l.canRaise); assertEquals(300, l.minTo)
    }

    @Test
    fun example3AllInBelowMinBetDoesNotReopen() {
        val g = toFlop(intArrayOf(1000, 160, 1000, 1000), 50, 100)
        g.go(1, Move.CHECK)
        g.go(2, Move.RAISE, 60) // all-in below min bet
        val c = g.legal(3)
        assertTrue(c.canRaise); assertEquals(160, c.minTo)
        g.go(3, Move.CALL)
        val a = g.legal(1)
        assertFalse(a.canRaise); assertEquals(60, a.call)
    }

    @Test
    fun example4BigBlindKeepsOptionAfterShortAllIn() {
        val g = table(150, 1000, 1000, button = 0)
        g.apply(StartHand(50, 100))
        g.go(1, Move.RAISE, 150) // all-in
        g.go(2, Move.CALL)
        val l = g.legal(3)
        assertTrue(l.canRaise); assertEquals(250, l.minTo)
    }

    @Test
    fun example5FullRaiseOverShortAllInSetsNewIncrement() {
        val g = toFlop(intArrayOf(1000, 190, 1000, 1000), 5, 10)
        g.go(1, Move.RAISE, 100)
        g.go(2, Move.RAISE, 180)
        g.go(3, Move.RAISE, 300)
        assertEquals(120, g.h.lfr)
        val l = g.legal(1)
        assertTrue(l.canRaise); assertEquals(420, l.minTo)
    }

    @Test
    fun minimumRaiseFollowsLastRaiseSize() {
        val g = table(1000, 1000, 1000, button = 0)
        g.apply(StartHand(50, 100))
        assertEquals(200, g.legal(1).minTo)
        g.go(1, Move.RAISE, 300)
        assertEquals(500, g.legal(2).minTo)
        assertFailsWith<RuleError> { g.apply(Act(2, Move.RAISE, 450)) }
    }

    @Test
    fun outOfTurnActionIsRejected() {
        val g = table(1000, 1000, 1000, button = 0)
        g.apply(StartHand(5, 10))
        assertFailsWith<RuleError> { g.apply(Act(2, Move.CALL)) }
    }

    @Test
    fun sidePotsMatchWorkedExample() {
        val g = table(1000, 1000, 1000, 1000, 1000)
        val h = Hand(1, 5, 10, 5, 1, 2, listOf(1, 2, 3, 4, 5))
        h.tc.putAll(mapOf(1 to 50, 2 to 120, 3 to 200, 4 to 200, 5 to 80))
        h.folded.add(5)
        val pots = g.pots(h)
        assertEquals(listOf(250, 240, 160), pots.map { it.amount })
        assertEquals(listOf(listOf(1, 2, 3, 4), listOf(2, 3, 4), listOf(3, 4)), pots.map { it.eligible })
    }

    @Test
    fun uncalledBetIsReturnedAndShortStackWinsOnlyMainPot() {
        val g = table(1000, 1000, 300, button = 0)
        g.apply(StartHand(5, 10)) // btn P1, SB P2, BB P3
        g.go(1, Move.RAISE, 600)
        g.go(2, Move.CALL)
        g.go(3, Move.CALL) // all-in 300
        // P1 and P2 continue on later streets.
        assertEquals(Street.FLOP, g.h.street)
        g.go(2, Move.CHECK); g.go(1, Move.CHECK)
        g.go(2, Move.CHECK); g.go(1, Move.CHECK)
        g.go(2, Move.RAISE, 400) // P2 has 400 left
        g.go(1, Move.FOLD)
        // P1 folded; P2 vs P3 showdown. Side pot (P1+P2 extra) is P2's only.
        assertEquals(Street.SHOWDOWN, g.h.street)
        g.apply(Event.Award(listOf(listOf(3))))
        g.checkInvariants()
        assertEquals(900, g.player(3).stack) // main pot: 300 x 3
        assertEquals(400 + 600, g.player(2).stack) // uncontested side pot (P1 300 + P2 300); river bet returned
        assertEquals(400, g.player(1).stack)
    }

    @Test
    fun oddChipGoesToFirstWinnerLeftOfButton() {
        val g = table(1000, 1000, 1000, button = 0)
        g.apply(StartHand(5, 10)) // btn P1, SB P2, BB P3
        g.go(1, Move.CALL); g.go(2, Move.FOLD); g.go(3, Move.CHECK)
        repeat(3) { g.go(3, Move.CHECK); g.go(1, Move.CHECK) }
        assertEquals(Street.SHOWDOWN, g.h.street)
        g.apply(Event.Award(listOf(listOf(1, 3)))) // pot 25, unit 5 -> 15 / 10
        assertEquals(1000 - 10 + 10, g.player(1).stack)
        assertEquals(1000 - 10 + 15, g.player(3).stack) // P3 is first left of button
    }

    @Test
    fun noBigBlindTwiceInARowWhenGoingHeadsUp() {
        val g = table(1000, 1000, 1000, button = 0)
        g.apply(StartHand(5, 10)) // btn P1, SB P2, BB P3
        g.go(1, Move.FOLD); g.go(2, Move.FOLD)
        g.apply(Event.Adjust(1, 0)) // P1 busts
        g.apply(StartHand(5, 10))
        assertEquals(3, g.h.button); assertEquals(3, g.h.sbId); assertEquals(2, g.h.bbId)
    }

    @Test
    fun buttonMovesOneSeatAndSkipsBustedPlayers() {
        val g = table(1000, 1000, 1000, 1000, button = 0)
        g.apply(StartHand(5, 10))
        assertEquals(listOf(1, 2, 3), listOf(g.h.button, g.h.sbId, g.h.bbId))
        g.go(4, Move.FOLD); g.go(1, Move.FOLD); g.go(2, Move.FOLD)
        g.apply(Event.Adjust(3, 0))
        g.apply(StartHand(5, 10))
        assertEquals(listOf(2, 4, 1), listOf(g.h.button, g.h.sbId, g.h.bbId))
    }

    @Test
    fun waitingPlayerIsDealtInOnlyAsBigBlind() {
        val g = table(1000, 1000, 1000, button = 0)
        g.apply(StartHand(5, 10)) // btn P1, SB P2, BB P3
        g.go(1, Move.FOLD); g.go(2, Move.FOLD)
        g.apply(Event.AddPlayer("New", 1000, 1, Entry.WAIT)) // seated between P1 and P2 -> id 4
        g.apply(StartHand(5, 10)) // btn P2, SB P3, BB P1; New would be btn-adjacent, not BB
        assertFalse(4 in g.h.dealt)
        g.go(2, Move.FOLD); g.go(3, Move.FOLD)
        g.apply(StartHand(5, 10)) // btn P3, SB P1, BB New
        assertEquals(4, g.h.bbId)
        assertTrue(4 in g.h.dealt)
    }

    @Test
    fun postingPlayerHasOptionLikeBigBlind() {
        val g = table(1000, 1000, 1000, button = 0)
        g.apply(StartHand(5, 10))
        g.go(1, Move.FOLD); g.go(2, Move.FOLD)
        g.apply(Event.AddPlayer("New", 1000, 3, Entry.POST)) // after P3 -> id 4
        g.apply(StartHand(5, 10)) // btn P2, SB P3, BB 4? order P1,P2,P3,New: btn P2, SB P3, BB New
        assertEquals(4, g.h.bbId)
        assertTrue(g.h.posts.isEmpty())
    }

    @Test
    fun shortBigBlindHeadsUpReturnsUncalledAndRunsOut() {
        val g = table(1000, 40, button = 0)
        g.apply(StartHand(50, 100)) // btn/SB P2? button seat 0 -> P1 btn+SB, P2 BB all-in 40
        assertNull(g.h.toAct)
        assertEquals(Street.SHOWDOWN, g.h.street)
        assertEquals(960, g.player(1).stack) // 10 of the 50 SB returned
        g.apply(Event.Award(listOf(listOf(2))))
        assertEquals(80, g.player(2).stack)
    }

    @Test
    fun refereeAwardExplainsWinner() {
        val g = table(1000, 1000, button = 0)
        g.apply(StartHand(5, 10))
        g.go(1, Move.CALL); g.go(2, Move.CHECK)
        repeat(3) { g.go(2, Move.CHECK); g.go(1, Move.CHECK) }
        val c = { s: String -> Cards.parse(s) }
        val board = listOf("Kh", "7d", "7c", "2s", "9h").map(c)
        g.apply(Event.Award(listOf(listOf(1)), board, mapOf(1 to listOf(c("Ks"), c("Qd")), 2 to listOf(c("Kd"), c("Jc")))))
        val why = g.log.last().text
        assertTrue("kicker" in why, why)
        assertEquals(1010, g.player(1).stack)
    }

    @Test
    fun randomPlayKeepsChipsConservedAndReplaysIdentically() {
        val rnd = java.util.Random(7)
        repeat(300) {
            val n = 2 + rnd.nextInt(9)
            val events = ArrayList<Event>()
            val g = Game()
            fun ap(e: Event) { g.apply(e); events.add(e); g.checkInvariants() }
            ap(Event.Create((1..n).map { "P$it" }, 100 + rnd.nextInt(2000), rnd.nextInt(n)))
            repeat(40) {
                while (g.players.count { it.stack > 0 && !it.sittingOut } < 2) {
                    val broke = g.players.first { it.stack == 0 }
                    ap(Event.Rebuy(broke.id, 500))
                }
                ap(StartHand(5, 10))
                var guard = 0
                while (g.inHand && guard++ < 500) {
                    val h = g.hand!!
                    if (h.street == Street.SHOWDOWN) {
                        val live = h.live.shuffled(rnd)
                        val groups = live.chunked(1 + rnd.nextInt(2))
                        ap(Event.Award(groups)); break
                    }
                    val id = h.toAct!!
                    val l = g.legal(id)
                    val r = rnd.nextInt(10)
                    when {
                        r < 1 -> ap(Act(id, Move.FOLD))
                        r < 6 && l.canCheck -> ap(Act(id, Move.CHECK))
                        r < 6 && l.canCall -> ap(Act(id, Move.CALL))
                        l.canRaise -> ap(Act(id, Move.RAISE, l.minTo + rnd.nextInt(l.maxTo - l.minTo + 1)))
                        l.canCall -> ap(Act(id, Move.CALL))
                        else -> ap(Act(id, Move.CHECK))
                    }
                }
                assertFalse(g.inHand)
                if (rnd.nextInt(10) == 0 && g.players.size > 2) ap(Event.RemovePlayer(g.players[rnd.nextInt(g.players.size)].id))
                if (rnd.nextInt(10) == 0 && g.players.size < 10) ap(Event.AddPlayer("X${g.log.size}", 700, rnd.nextInt(g.players.size + 1), Entry.entries[rnd.nextInt(3)]))
            }
            val replay = Game()
            events.forEach { replay.apply(it) }
            assertEquals(g.players.map { it.id to it.stack }, replay.players.map { it.id to it.stack })
            assertEquals(g.log, replay.log)
        }
    }
}
