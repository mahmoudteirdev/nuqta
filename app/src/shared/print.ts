// شغل الطباعة: البيانات اللي بتنعرض بصفحة الطباعة. صفحة الطباعة بتطلبها بالرقم وبترسمها،
// والعملية الرئيسية بتطبعها أو بتحفظها PDF. المال بالأغورة.

import type { PrintTemplate, StatementEntry } from './api'
import type { Agorot } from './money'

export interface CardsJob {
  kind: 'cards'
  template: PrintTemplate
  networkName: string
  phone: string
  showPrice: boolean
  categoryName: string
  saleAg: Agorot
  batchNo: number
  codes: string[]
}

export interface StatementJob {
  kind: 'statement'
  networkName: string
  distributorName: string
  area: string
  printedAt: string
  held: number
  usedValueAg: Agorot
  paidAg: Agorot
  owedAg: Agorot
  creditLimitAg: Agorot
  /** الأقدم أول، زي الكشف الورقي. */
  entries: StatementEntry[]
}

export interface ReportJob {
  kind: 'report'
  networkName: string
  title: string
  subtitle: string
  printedAt: string
  /** صفوف جاهزة للعرض: نص بس، عشان صفحة الطباعة ما تعيد الحساب. */
  columns: string[]
  rows: string[][]
  /** أعمدة أرقام بتنعرض LTR ومحاذية. */
  numeric: number[]
  footer?: string[]
}

export type PrintJob = CardsJob | StatementJob | ReportJob
