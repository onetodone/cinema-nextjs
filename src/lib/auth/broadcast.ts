import type { User } from '@/lib/api/types'
import type { AccessToken } from '@/lib/auth/token-store'

// The channel that keeps this origin's tabs in one session. BroadcastChannel is same-origin and never delivers a
// message to the tab that sent it.

const CHANNEL_NAME = 'cinema-auth'

export type SignOutReason = 'logout' | 'expired'

export type AuthMessage =
  /** A tab starts and asks whether a peer holds a token it can use. */
  | { type: 'hello' }
  /** A tab holds this token (after a login or refresh, or answering a hello). */
  | { type: 'session'; token: AccessToken; user: User }
  /**
   * The session is over: signed out on purpose, or refused by the API. A revoked session looks expired (the API
   * does not say why a refresh failed).
   */
  | {
      type: 'signed-out'
      reason: SignOutReason
      /** When it ended (epoch ms): a token issued before then, still on its way to a tab, is not adopted. */
      at: number
    }

let channel: BroadcastChannel | null | undefined

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel =
      typeof window === 'undefined' || typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(CHANNEL_NAME)
  }
  return channel
}

export function postAuthMessage(message: AuthMessage): void {
  getChannel()?.postMessage(message)
}

/** Calls `listener` for every message from other tabs; returns the unsubscribe function. */
export function subscribeAuthMessages(listener: (message: AuthMessage) => void): () => void {
  const target = getChannel()
  if (!target) return () => {}
  const onMessage = (event: MessageEvent<AuthMessage>) => listener(event.data)
  target.addEventListener('message', onMessage)
  return () => target.removeEventListener('message', onMessage)
}
