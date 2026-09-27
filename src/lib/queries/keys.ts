// Every TanStack Query key comes from here. Public catalog data lives under ['catalog']; everything personal lives
// under ['private'], so a sign-out or a change of account drops all of it with one removeQueries(['private']).
export const queryKeys = {
  catalog: {
    all: ['catalog'] as const,
    movies: () => ['catalog', 'movies'] as const,
    seatMap: (showtimeId: number) => ['catalog', 'seat-map', showtimeId] as const,
    paymentMethods: () => ['catalog', 'payment-methods'] as const,
  },
  private: {
    all: ['private'] as const,
    me: () => ['private', 'me'] as const,
    /** Every booking query: invalidating it refreshes the lists and the single bookings alike. */
    bookings: () => ['private', 'bookings'] as const,
    /** The caller's unpaid bookings (pending or processing). */
    activeBookings: () => ['private', 'bookings', 'active'] as const,
    /** The caller's other bookings (paid, expired, canceled), page by page, for "My bookings". */
    bookingHistory: () => ['private', 'bookings', 'history'] as const,
    booking: (bookingId: string) => ['private', 'bookings', 'detail', bookingId] as const,
    /** The caller's signed-in browsers and devices. */
    sessions: () => ['private', 'sessions'] as const,
  },
}
