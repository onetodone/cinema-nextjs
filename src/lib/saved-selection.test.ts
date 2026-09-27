import { afterEach, describe, expect, it } from 'vitest'
import { saveSelection, takeSavedSelection } from '@/lib/saved-selection'

afterEach(() => sessionStorage.clear())

describe('saved selections', () => {
  it('keeps a pick per showtime until it is taken back, once', () => {
    saveSelection(7, [12, 13])
    saveSelection(8, [1])

    expect(takeSavedSelection(7)).toEqual([12, 13])
    expect(takeSavedSelection(7)).toBeNull()
    expect(takeSavedSelection(8)).toEqual([1])
  })

  it('drops what cannot be a seat id, duplicates, and seats beyond the booking limit', () => {
    sessionStorage.setItem(
      'cinema:selection:7',
      JSON.stringify({ seatIds: [3, 3, -1, 'x', 1.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] }),
    )
    expect(takeSavedSelection(7)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

    sessionStorage.setItem('cinema:selection:7', '"nonsense"')
    expect(takeSavedSelection(7)).toBeNull()
  })
})
