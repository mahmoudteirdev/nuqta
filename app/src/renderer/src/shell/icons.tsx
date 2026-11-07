// أيقونات القائمة والحالة، نفس مسارات assets/icons. بتاخذ لون النص.
import type { ReactNode } from 'react'
import type { NavId } from '@/lib/screens'

function Svg({ children, size = 20, join = true }: { children: ReactNode; size?: number; join?: boolean }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin={join ? 'round' : undefined}>
      {children}
    </svg>
  )
}

export const NavIcon: Record<NavId, () => ReactNode> = {
  home: () => <Svg><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Svg>,
  account: () => <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></Svg>,
  batch: () => <Svg><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" /></Svg>,
  network: () => <Svg><path d="M2 9a15 15 0 0 1 20 0M5.5 13a10 10 0 0 1 13 0M9 16.5a5 5 0 0 1 6 0" /><circle cx="12" cy="20" r="1" /></Svg>,
  reports: () => <Svg join={false}><path d="M5 20V10M12 20V4M19 20v-7" /></Svg>,
  settings: () => <Svg join={false}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Svg>
}

export const StatusIcon = {
  err: () => <Svg><path d="M12 4l9 16H3zM12 10v4M12 17v.5" /></Svg>,
  warn: () => <Svg join={false}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>,
  ok: () => <Svg><path d="M4 12l5 5L20 6" /></Svg>
}

export function Logo({ size = 32, stroke = '#F4F5F0' }: { size?: number; stroke?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48">
      <circle cx="24" cy="10" r="6.5" fill="#F26B21" />
      <path d="M5.5 21v4a18.5 18.5 0 0 0 37 0v-4" fill="none" stroke={stroke} strokeWidth={7.5} strokeLinecap="round" />
    </svg>
  )
}
