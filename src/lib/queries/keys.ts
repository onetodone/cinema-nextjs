// Every TanStack Query key comes from here. Public catalog data lives under ['catalog']; everything personal will
// live under ['private'], so signing out can drop all of it with one removeQueries(['private']).
export const queryKeys = {
  catalog: {
    all: ['catalog'] as const,
    movies: () => ['catalog', 'movies'] as const,
    seatMap: (showtimeId: number) => ['catalog', 'seat-map', showtimeId] as const,
  },
  private: {
    all: ['private'] as const,
  },
}
