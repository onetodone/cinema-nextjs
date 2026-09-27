// Every request that changes the refresh cookie (login, refresh, logout, logout-all) runs under one lock shared by
// all tabs (Web Locks). Serialised, they never race: a refresh never presents a cookie that a concurrent logout is
// ending, a 401 that clears the cookie never lands after a login that set a new one, and N tabs whose tokens expire
// together make one refresh — the others find the new token when their turn comes.
//
// Without Web Locks (old browsers), a promise chain serialises this tab's requests; the API's 30-second grace
// window keeps tabs that refresh at once signed in.

const LOCK_NAME = 'cinema-auth'

let localTail: Promise<unknown> = Promise.resolve()

/** Runs `task` while holding the auth lock; resolves or rejects with its result. Never nest calls: the lock is not reentrant. */
export function withAuthLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, task)
  }
  const run = localTail.then(task, task)
  localTail = run.catch(() => {})
  return run
}
