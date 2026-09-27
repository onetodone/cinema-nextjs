'use client'

import { useState } from 'react'
import { XIcon } from 'lucide-react'
import type { Booking } from '@/lib/api/types'
import { seatNames } from '@/lib/seat-map'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

/** "Cancel hold", confirmed first: the seats go back on sale at once. */
export function CancelHoldButton({
  booking,
  disabled,
  pending,
  onConfirm,
}: {
  booking: Booking
  disabled: boolean
  /** The cancel request is on its way. */
  pending: boolean
  onConfirm: () => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)

  async function confirm() {
    if (!(await onConfirm())) setOpen(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="lg" className="text-muted-foreground" disabled={disabled} />}
      >
        <XIcon data-icon="inline-start" aria-hidden="true" />
        Cancel hold
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Release your seats?</AlertDialogTitle>
          <AlertDialogDescription>
            {seatNames(booking.seats)} go back on sale at once, and someone else may book them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep them</AlertDialogCancel>
          <Button variant="destructive" onClick={() => void confirm()} disabled={pending}>
            {pending ? 'Releasing…' : 'Release seats'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
