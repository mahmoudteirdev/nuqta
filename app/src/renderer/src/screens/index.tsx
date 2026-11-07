import type { ReactNode } from 'react'
import type { ScreenId } from '@/lib/screens'
import { Account } from './Account'
import { Batch } from './Batch'
import { Card } from './Card'
import { Home } from './Home'
import { Network } from './Network'
import { Reports } from './Reports'
import { Settings } from './Settings'

export const SCREENS: Record<ScreenId, () => ReactNode> = {
  home: Home,
  account: Account,
  batch: Batch,
  card: Card,
  network: Network,
  reports: Reports,
  settings: Settings
}
