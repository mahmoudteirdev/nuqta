import { useState } from 'react'
import { api } from '@/lib/api'
import { errorText } from '@/lib/actions'
import { t } from '@/lib/i18n'
import { Dialog } from '@/shell/Dialog'
import { useToast } from '@/shell/Toast'

export function ExtendDialog({
  code,
  onCancel,
  onDone
}: {
  code: string
  onCancel: () => void
  onDone: (newLimit: string) => void
}) {
  const say = useToast()
  const [minutes, setMinutes] = useState(60)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const PRESETS = [
    { label: t('extend.m30'), mins: 30 },
    { label: t('extend.h1'), mins: 60 },
    { label: t('extend.h2'), mins: 120 },
    { label: t('extend.h3'), mins: 180 },
    { label: t('extend.d1'), mins: 1440 }
  ]

  return (
    <Dialog
      title={t('extend.title', { code })}
      body={t('extend.body')}
      okLabel={t('extend.ok')}
      cancelLabel={t('extend.cancel')}
      busy={busy}
      busyLabel={t('extend.busy')}
      error={err}
      onCancel={onCancel}
      onOk={async () => {
        if (minutes <= 0) return setErr(t('extend.errValid'))
        setBusy(true)
        const r = await api.extendCard(code, minutes)
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        say(t('extend.success', { code }))
        onDone(r.value.newLimit)
      }}
    >
      <div className="fld">
        <label className="lbl">{t('extend.label')}</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {PRESETS.map((p) => (
            <button
              key={p.mins}
              type="button"
              className={minutes === p.mins ? 'btn btn-p sm' : 'btn btn-s sm'}
              onClick={() => {
                setMinutes(p.mins)
                setErr('')
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
