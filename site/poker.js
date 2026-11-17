// Chipless web tools: hand evaluator and settle-up solver. Plain JS, no dependencies.
// Mirrors the app's Kotlin engine (engine/src/main/kotlin/app/chipless/engine).
(function (root) {
  const RANKS = '23456789TJQKA'
  const NAME = { 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten', 9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five', 4: 'Four', 3: 'Three', 2: 'Two' }
  const PLURAL = { 6: 'Sixes' }
  const many = (r) => PLURAL[r] || NAME[r] + 's'
  const CATS = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush']
  // How many leading tiebreak values are the "made hand" (the rest are kickers).
  const MAIN = [0, 1, 2, 1, 1, 0, 2, 1, 1]

  const rank = (c) => RANKS.indexOf(c[0]) + 2

  /** Score exactly five cards: [category, ...tiebreak ranks], compared lexicographically. */
  function score5(cs) {
    const rs = cs.map(rank).sort((a, b) => b - a)
    const flush = cs.every((c) => c[1] === cs[0][1])
    const uniq = [...new Set(rs)]
    let top = 0
    if (uniq.length === 5) {
      if (rs[0] - rs[4] === 4) top = rs[0]
      else if (rs[0] === 14 && rs[1] === 5) top = 5 // A-2-3-4-5, the "wheel"
    }
    if (top && flush) return [8, top]
    const cnt = {}
    rs.forEach((r) => (cnt[r] = (cnt[r] || 0) + 1))
    const groups = Object.keys(cnt).map(Number).sort((a, b) => cnt[b] - cnt[a] || b - a)
    const shape = groups.map((r) => cnt[r]).join('')
    if (shape === '41') return [7, ...groups]
    if (shape === '32') return [6, ...groups]
    if (flush) return [5, ...rs]
    if (top) return [4, top]
    if (shape === '311') return [3, ...groups]
    if (shape === '221') return [2, ...groups]
    if (shape === '2111') return [1, ...groups]
    return [0, ...rs]
  }

  const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d } return 0 }

  /** Best five of 5–7 cards: { score, best }. */
  function best(cards) {
    let out = null
    const pick = (start, five) => {
      if (five.length === 5) {
        const s = score5(five)
        if (!out || cmp(s, out.score) > 0) out = { score: s, best: five }
        return
      }
      for (let i = start; i <= cards.length - (5 - five.length); i++) pick(i + 1, [...five, cards[i]])
    }
    pick(0, [])
    // Display order: biggest group first, then by rank; the wheel shows 5-4-3-2-A.
    const n = {}
    out.best.forEach((c) => (n[rank(c)] = (n[rank(c)] || 0) + 1))
    const wheel = (out.score[0] === 4 || out.score[0] === 8) && out.score[1] === 5
    const v = (c) => (wheel && rank(c) === 14 ? 1 : rank(c))
    out.best = [...out.best].sort((a, b) => n[rank(b)] - n[rank(a)] || v(b) - v(a))
    return out
  }

  function describe(s) {
    const [c, a, b] = s
    switch (c) {
      case 8: return a === 14 ? 'Royal flush' : `Straight flush, ${NAME[a]} high`
      case 7: return `Four ${many(a)}`
      case 6: return `Full house, ${many(a)} full of ${many(b)}`
      case 5: return `Flush, ${NAME[a]} high`
      case 4: return `Straight, ${NAME[a]} high`
      case 3: return `Three ${many(a)}`
      case 2: return `Two pair, ${many(a)} and ${many(b)}`
      case 1: return `Pair of ${many(a)}`
      default: return `High card, ${NAME[a]}`
    }
  }

  const lc = (t) => t[0].toLowerCase() + t.slice(1)
  const cat = (s) => (s[0] === 8 && s[1] === 14 ? 'Royal flush' : CATS[s[0]])

  /** Why the winner's score beats the runner-up's, in one sentence. */
  function why(w, l) {
    if (w[0] !== l[0] || cat(w) !== cat(l)) return `${cat(w)} beats ${lc(cat(l))}.`
    const i = w.findIndex((v, k) => v !== l[k])
    if (i < 0) return 'Same five-card hand, so the pot is split.'
    const main = MAIN[w[0]]
    if (main === 0) return `${w[0] ? 'Both have a flush' : 'Nobody has a pair'}; the highest different card decides: ${NAME[w[i]]} beats ${NAME[l[i]]}.`
    const part = (s) => { const d = describe(s); return d.includes(', ') ? d.split(', ')[1] : lc(d) }
    if (i <= main) return `Both have ${({ 1: 'a pair', 4: 'a straight', 6: 'a full house' })[w[0]] || lc(CATS[w[0]])}, but ${part(w)} beats ${part(l)}.`
    return `Both have ${lc(describe(w))}. The ${NAME[w[i]]} kicker beats the ${NAME[l[i]]}.`
  }

  /** Evaluate hands against a board. Returns { hands: [{score, best, name}], winners: [index], text }. */
  function showdown(board, holes) {
    const hands = holes.map((h) => { const r = best([...board, ...h]); return { ...r, name: describe(r.score) } })
    let top = null
    hands.forEach((h) => { if (!top || cmp(h.score, top) > 0) top = h.score })
    const winners = hands.map((h, i) => (cmp(h.score, top) === 0 ? i : -1)).filter((i) => i >= 0)
    let text
    if (hands.length === 1) text = hands[0].name + '.'
    else if (winners.length > 1) text = `Split pot: ${winners.length} players tie with ${lc(hands[winners[0]].name)}.`
    else {
      const rest = hands.filter((_, i) => i !== winners[0]).map((h) => h.score).sort((a, b) => -cmp(a, b))[0]
      text = why(top, rest)
    }
    return { hands, winners, text }
  }

  /**
   * Fewest payments to settle nets (integers, sum 0). Exact: n minus the most zero-sum groups
   * (subset DP), then greedy inside each group. Returns [{from, to, amount}] with indexes.
   */
  function settle(nets) {
    const idx = nets.map((v, i) => i).filter((i) => nets[i] !== 0)
    const n = idx.length
    if (n === 0) return []
    if (n > 16) return greedy(idx, nets)
    const full = (1 << n) - 1
    const sum = new Float64Array(1 << n), dp = new Int8Array(1 << n)
    for (let m = 1; m <= full; m++) {
      const low = m & -m, i = 31 - Math.clz32(low)
      sum[m] = sum[m ^ low] + nets[idx[i]]
      let bestv = 0
      for (let k = 0; k < n; k++) if (m & (1 << k)) bestv = Math.max(bestv, dp[m ^ (1 << k)])
      dp[m] = bestv + (sum[m] === 0 ? 1 : 0)
    }
    // Peel people off in an order whose zero-sum prefixes are the groups.
    const order = []
    for (let m = full; m; ) {
      for (let k = 0; k < n; k++) {
        if (!(m & (1 << k))) continue
        if (dp[m ^ (1 << k)] + (sum[m] === 0 ? 1 : 0) === dp[m]) { order.push(k); m ^= 1 << k; break }
      }
    }
    order.reverse()
    const out = []
    let group = [], run = 0
    for (const k of order) {
      group.push(idx[k]); run += nets[idx[k]]
      if (run === 0) { out.push(...greedy(group, nets)); group = [] }
    }
    return out
  }

  function greedy(ids, nets) {
    const bal = ids.map((i) => ({ i, v: nets[i] }))
    const out = []
    for (;;) {
      const debt = bal.filter((b) => b.v < 0).sort((a, b) => a.v - b.v)[0]
      const cred = bal.filter((b) => b.v > 0).sort((a, b) => b.v - a.v)[0]
      if (!debt || !cred) return out
      const amt = Math.min(-debt.v, cred.v)
      out.push({ from: debt.i, to: cred.i, amount: amt })
      debt.v += amt; cred.v -= amt
    }
  }

  const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' }
  const SUITNAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
  const cardHtml = (c) => `<span class="card${c[1] === 'h' || c[1] === 'd' ? ' r' : ''}" role="img" aria-label="${NAME[rank(c)]} of ${SUITNAME[c[1]]}">${c[0] === 'T' ? '10' : c[0]}<i aria-hidden="true">${SUIT[c[1]]}</i></span>`

  const api = { score5, best, describe, why, showdown, settle, cmp, cardHtml, RANKS, SUIT, CATS }
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.Poker = api
})(this)
