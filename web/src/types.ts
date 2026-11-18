export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'done'

export interface Cfg {
  sb: number; bb: number; stack: number
  mode: 'free' | 'money'; currency: string; money: number; decimals: number
  teach: 'beginner' | 'mixed' | 'pro'; timer: boolean; minutes: number
}

export interface PlayerS {
  id: number; name: string; stack: number; seat: number
  out: boolean; waiting: boolean; post: boolean
  buyIn: number; net: number
  conn: 'on' | 'off' | null; seen: number | null
}

export interface Legal {
  id: number; canCheck: boolean; canCall: boolean; call: number
  canRaise: boolean; minTo: number; maxTo: number; isBet: boolean
  why: string | null; sc: number; stack: number
}

export interface PotS { amount: number; eligible: number[] }
export interface ResultS { amount: number; winners: number[]; shares: Record<string, number> }
export interface ScoreS { desc: string; cat: string; best: string[]; cards: string[] }

export interface HandS {
  no: number; street: Street; button: number; sbId: number; bbId: number
  sb: number; bb: number; dealt: number[]; folded: number[]
  toAct: number | null; currentBet: number; lfr: number
  bets: Record<string, number>; total: number; pots: PotS[]
  labels: Record<string, string>; legal: Legal | null
  showFirst: number | null; runout: Street | null
  results: ResultS[]; board: string[]; scores: Record<string, ScoreS>
}

export interface LogLine {
  h: number; text: string; kind: string; who: number | null
  /** Short action label ("Raise 400"), chips involved, and how much the bet went up. */
  tag: string | null; amt: number; by: number
}

export interface ExportS { text: string; file: string; backup?: string; backupFile?: string }

export interface TimerS {
  level: number; sb: number; bb: number; nextSb: number; nextBb: number
  running: boolean; left: number; endsAt: number | null; minutes: number
}

export interface SettleS {
  balanced: boolean; in: number; out: number
  nets: { id: number; name: string; chips: number; money: number | null; buyIn: number }[]
  transfers: { from: number; to: number; amount: number }[]
}

export interface Snap {
  seq: number; now: number; phase: 'setup' | 'play' | 'ended'
  cfg: Cfg; lan: { open: boolean; urls: string[] }
  handNo: number; button: number | null
  players: PlayerS[]
  departed: { id: number; name: string; stack: number; buyIn: number }[]
  hand: HandS | null
  prompt: string; cue: string | null; hint: { key: string; text: string } | null
  notice: string | null
  log: LogLine[]
  undo: { host: boolean; by: number | null }
  timer: TimerS | null
  settle: SettleS | null
}

export interface EvalResult {
  hands: { name: string; desc: string; cat: string; best: string[] }[]
  winners: number[]; text: string; final: boolean
}
