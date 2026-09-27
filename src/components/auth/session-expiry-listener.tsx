'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { onSignedOut } from '@/lib/auth/session'

/**
 * Says why the tab was signed out when it was not this tab's doing. Navigation is left to the guards: a protected
 * page goes to sign-in, a public page only changes its header.
 */
export function SessionExpiryListener() {
  useEffect(
    () =>
      onSignedOut(({ reason, remote }) => {
        if (reason === 'expired') {
          toast.error('Your session has ended. Please sign in again.', { id: 'signed-out' })
        } else if (remote) {
          toast.info('You signed out in another tab.', { id: 'signed-out' })
        }
      }),
    [],
  )

  return null
}
