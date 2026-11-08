import { useState } from 'react'
import { normCode } from '@shared/input'
import { backupText, splitFirstSentence, t } from '@/lib/i18n'
import { netUp, routerUp, useStore } from '@/lib/store'
import { StatusIcon } from './icons'

/** شريط حالة الراوتر والنت، والبحث عن كرت، وزر تبديل اللغة. ثابت في كل شاشة. */
export function StatusBar() {
  const { state, dispatch } = useStore()
  const [code, setCode] = useState('')

  const isEn = state.lang === 'en'
  const router = routerUp(state)
  const net = netUp(state)
  const minutes = state.netDownSince ? Math.max(1, Math.round((Date.now() - state.netDownSince) / 60_000)) : 1
  const kind = !router ? 'er' : !net ? 'wa' : 'ok'
  const bText = backupText(state.status?.lastBackupAt ?? null, state.lang)
  const text = !router
    ? t('banner.routerDown')
    : !net
      ? t('banner.netDown', { m: minutes })
      : isEn
        ? `All systems online. ${bText}`
        : `كل شيء متصل. ${bText}`

  const [title, rest] = splitFirstSentence(text)
  const Icon = kind === 'er' ? StatusIcon.err : kind === 'wa' ? StatusIcon.warn : StatusIcon.ok

  return (
    <div className={`bn ${kind} topbn`}>
      <span role="status">
        <Icon />
        <span><strong>{title}</strong> {rest}</span>
      </span>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div className="box" dir="ltr">
          <input aria-label={t('status.searchLabel')} value={code} dir={isEn ? 'ltr' : 'rtl'} placeholder={t('status.searchPlaceholder')}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              dispatch({ type: 'checkCard', code: normCode(code) })
              setCode('')
            }} />
        </div>
        <button
          type="button"
          className="btn btn-g sm"
          style={{ minWidth: 64, fontWeight: 600, border: '1px solid var(--line)', background: '#fff' }}
          onClick={() => dispatch({ type: 'setLang', lang: isEn ? 'ar' : 'en' })}
          title={isEn ? 'التحويل إلى العربية' : 'Switch to English'}
        >
          {isEn ? 'عربي' : 'English'}
        </button>
      </div>
    </div>
  )
}
