import type { BookingStatus } from '@/lib/api/types'
import { Badge } from '@/components/ui/badge'

const STATUS: Record<BookingStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  pending: { label: 'Awaiting payment', variant: 'outline' },
  processing: { label: 'Payment processing', variant: 'outline' },
  paid: { label: 'Paid', variant: 'default' },
  expired: { label: 'Expired', variant: 'secondary' },
  canceled: { label: 'Canceled', variant: 'secondary' },
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { label, variant } = STATUS[status]
  return <Badge variant={variant}>{label}</Badge>
}
