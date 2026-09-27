import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { cn } from '@/lib/utils'

/** Modules of white space around the code: scanners need a quiet zone. */
const QUIET_ZONE = 4

/** One SVG path of the dark modules, a 1×1 square each, run-length joined along the rows. */
function qrPath(value: string): { size: number; d: string } {
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()
  const count = qr.getModuleCount()
  let d = ''
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue
      let run = 1
      while (col + run < count && qr.isDark(row, col + run)) run++
      d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h${run}v1h-${run}z`
      col += run - 1
    }
  }
  return { size: count + QUIET_ZONE * 2, d }
}

/**
 * A QR code of `value`, drawn as an inline SVG (no image request, no canvas). It stays dark on white in both themes,
 * as scanners expect.
 */
export function TicketQr({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, d } = useMemo(() => qrPath(value), [value])
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn('aspect-square rounded-lg bg-white', className)}
    >
      <path d={d} fill="#000" />
    </svg>
  )
}
