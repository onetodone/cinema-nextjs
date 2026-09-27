import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Seat } from '@/lib/api/types'
import { reconcileSelection, seatNames } from '@/lib/seat-map'

interface SelectionState {
  ids: number[]
  /** The seat map the selection was last checked against. */
  seatsById: ReadonlyMap<number, Seat>
  /** Seats dropped by the latest check that dropped any; a new array each time, which triggers one notice. */
  lost: readonly Seat[]
}

const NO_SEATS: readonly Seat[] = []

/**
 * The local seat selection of one showtime. Whenever a fresh seat map arrives, seats that are no longer available
 * leave the selection at once (adjusted during render, so a taken seat is never shown as picked) and the viewer is
 * told which ones.
 */
export function useSeatSelection(seatsById: ReadonlyMap<number, Seat>) {
  const [state, setState] = useState<SelectionState>({ ids: [], seatsById, lost: NO_SEATS })

  let current = state
  if (state.seatsById !== seatsById) {
    const { ids, lost } = reconcileSelection(state.ids, seatsById)
    current = { ids, seatsById, lost: lost.length > 0 ? lost : state.lost }
    setState(current)
  }

  const { lost } = current
  useEffect(() => {
    if (lost.length === 0) return
    const message =
      lost.length === 1 ? `Seat ${seatNames(lost)} was just taken` : `Seats ${seatNames(lost)} were just taken`
    toast.warning(message, {
      id: 'seats-taken',
      description: 'Someone else got there first. Pick another seat.',
    })
  }, [lost])

  return {
    ids: current.ids,
    setIds: (ids: number[]) => setState((previous) => ({ ...previous, ids })),
    clear: () => setState((previous) => ({ ...previous, ids: [] })),
  }
}
