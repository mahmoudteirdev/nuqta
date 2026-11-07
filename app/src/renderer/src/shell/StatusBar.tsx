import { useState } from 'react'
import { normCode } from '@shared/input'
import { splitFirstSentence, t } from '@/lib/i18n'
import { netUp, routerUp, useStore } from '@/lib/store'
import { StatusIcon } from './icons'

/** آخر نسخة على الجهاز. ما في نسخ سحابي لسا، فالنص ما بيحكي عن سحابة. */
function backupText(iso: string | null): string {
  if (!iso) return 'ما في نسخة لسا.'
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 1) return 'آخر نسخة قبل لحظات.'
  if (mins < 60) return `آخر نسخة قبل ${mins === 1 ? 'دقيقة' : mins === 2 ? 'دقيقتين' : mins <= 10 ? `${mins} دقائق` : `${mins} دقيقة`}.`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `آخر نسخة قبل ${hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتين' : hours <= 10 ? `${hours} ساعات` : `${hours} ساعة`}.`
  const days = Math.round(hours / 24)
  return `آخر نسخة قبل ${days === 1 ? 'يوم' : days === 2 ? 'يومين' : days <= 10 ? `${days} أيام` : `${days} يوم`}.`
}

/** شريط حالة الراوتر والنت، وبحث عن كرت. ثابت في كل شاشة. */
export function StatusBar() {
  const { state, dispatch } = useStore()
  const [code, setCode] = useState('')

  const router = routerUp(state)
  const net = netUp(state)
  const minutes = state.netDownSince ? Math.max(1, Math.round((Date.now() - state.netDownSince) / 60_000)) : 1
  const kind = !router ? 'er' : !net ? 'wa' : 'ok'
  const text = !router ? t('banner.routerDown') : !net ? t('banner.netDown', { m: minutes }) : `كل شيء متصل. ${backupText(state.status?.lastBackupAt ?? null)}`
  const [title, rest] = splitFirstSentence(text)
  const Icon = kind === 'er' ? StatusIcon.err : kind === 'wa' ? StatusIcon.warn : StatusIcon.ok

  return (
    <div className={`bn ${kind} topbn`}>
      <span role="status">
        <Icon />
        <span><strong>{title}</strong> {rest}</span>
      </span>
      <div className="box" dir="ltr">
        <input aria-label="ابحث عن كرت" value={code} dir="rtl" placeholder="ابحث عن كرت، واضغط Enter"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            dispatch({ type: 'checkCard', code: normCode(code) })
            setCode('')
          }} />
      </div>
    </div>
  )
}
