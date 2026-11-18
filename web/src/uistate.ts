import { useEffect, useState } from 'preact/hooks'

export type SheetKind =
  | { k: 'menu' } | { k: 'history' } | { k: 'players' } | { k: 'blinds' } | { k: 'settings' }
  | { k: 'invite' } | { k: 'seat'; id: number } | { k: 'referee' } | { k: 'calc' } | { k: 'confirm'; text: string; yes: string; run: () => void }
  | { k: 'ranks' } | { k: 'board' } | { k: 'seating' } | { k: 'export' } | { k: 'restore' } | { k: 'close' }

export type PreAction = 'checkfold' | 'check' | 'callany' | null

/** Local UI state (not shared with the table). */
export const ui = {
  sheet: null as SheetKind | null,
  /** Host chose to act for a player who's on their own phone. */
  actFor: null as number | null,
  raiseOpen: false,
  pre: null as PreAction,
  preBet: 0,
  /** Big banner for the latest action at the table ("Maya raises to 400"). */
  flash: null as null | { key: number; who: number | null; kind: string; title: string; sub: string },
}

const subs = new Set<() => void>()
export function uiSet(patch: Partial<typeof ui>) {
  Object.assign(ui, patch)
  subs.forEach((f) => f())
}
export function useUi() {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((x) => x + 1)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
  return ui
}
export const openSheet = (s: SheetKind) => uiSet({ sheet: s })
export const closeSheet = () => uiSet({ sheet: null })
