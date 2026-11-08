import { useState } from 'react'
import { api } from '@/lib/api'
import { errorText } from '@/lib/actions'
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
    { label: '30 دقيقة', mins: 30 },
    { label: 'ساعة واحدة', mins: 60 },
    { label: 'ساعتين', mins: 120 },
    { label: '3 ساعات', mins: 180 },
    { label: '24 ساعة (يوم)', mins: 1440 }
  ]

  return (
    <Dialog
      title={`زيادة وقت للكرت: ${code}`}
      body="اختر المدة الإضافية التي تريد إضافتها لوقت الكرت على الراوتر. سيتم تمديد وقت الكرت فوراً وسيستمر الزبون بالاتصال."
      okLabel="تأكيد زيادة الوقت"
      busy={busy}
      busyLabel="جاري التحديث..."
      error={err}
      onCancel={onCancel}
      onOk={async () => {
        if (minutes <= 0) return setErr('يرجى اختيار مدة صحيحة')
        setBusy(true)
        const r = await api.extendCard(code, minutes)
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        say(`تمت زيادة الوقت للكرت ${code} بنجاح.`)
        onDone(r.value.newLimit)
      }}
    >
      <div className="fld">
        <label className="lbl">المدة الإضافية</label>
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
