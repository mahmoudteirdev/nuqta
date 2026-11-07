// صفحة الطباعة: بتنفتح بنافذة مخفية، بتطلب شغلها بالرقم من العملية الرئيسية، بترسمه،
// وبتبلغ لما الخطوط تجهز، عشان ما ينطبع عربي بخط بديل.

import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { PrintJob } from '@shared/print'
import '../styles/fonts.css'
import './print.css'
import { CardsDoc, ReportDoc, StatementDoc } from './Docs'

function Doc({ job }: { job: PrintJob }) {
  if (job.kind === 'cards') return <CardsDoc job={job} />
  if (job.kind === 'statement') return <StatementDoc job={job} />
  return <ReportDoc job={job} />
}

/** مقاس الصفحة لازم يكون بـ@page عشان PDF والطابعة ياخذوه. */
function pageCss(job: PrintJob): string {
  if (job.kind === 'cards' && job.template === 'thermal') return '@page{size:80mm 55mm;margin:0}'
  return '@page{size:A4;margin:0}'
}

async function start(): Promise<void> {
  const id = location.hash.slice(1)
  const bridge = window.nuqta
  if (!bridge || !id) return
  const job = await bridge.call('printJob', id)
  if (!job) return
  const style = document.createElement('style')
  style.textContent = pageCss(job)
  document.head.appendChild(style)
  document.title = job.kind === 'cards' ? `كروت B-${job.batchNo}` : job.kind === 'statement' ? `كشف ${job.distributorName}` : job.title
  const root = createRoot(document.getElementById('root')!)
  flushSync(() => root.render(<Doc job={job} />))
  // الخط العربي والـMono لازم يكونوا محملين قبل الطباعة.
  await document.fonts.ready
  await Promise.all([
    document.fonts.load("600 20px 'IBM Plex Mono'"),
    document.fonts.load("400 13px 'IBM Plex Sans Arabic'"),
    document.fonts.load("600 13px 'IBM Plex Sans Arabic'")
  ])
  await bridge.call('printReady', id)
}

void start()
