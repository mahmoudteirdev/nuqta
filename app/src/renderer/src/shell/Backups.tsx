import { useState } from 'react'
import type { BackupInfo } from '@shared/api'
import { api } from '@/lib/api'
import { getLang, t } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { Dialog } from './Dialog'
import { useToast } from './Toast'

function getKindLabels(isEn: boolean): Record<BackupInfo['kind'], string> {
  return {
    auto: isEn ? 'Automatic' : 'تلقائية',
    manual: isEn ? 'Manual' : 'يدوية',
    'before-restore': isEn ? 'Before restore' : 'قبل استرجاع',
    'before-update': isEn ? 'Before update' : 'قبل تحديث',
    imported: isEn ? 'From file' : 'من ملف'
  }
}

const when = (iso: string, isEn: boolean) =>
  new Intl.DateTimeFormat(isEn ? 'en-US' : 'ar-u-nu-latn', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export function backupError(code: string, isEn = getLang() === 'en'): string {
  switch (code) {
    case 'backup_corrupt': return isEn ? 'Backup is corrupted and cannot be restored.' : 'النسخة تالفة، ما بنقدر نرجع لها.'
    case 'backup_too_new': return isEn ? 'Backup is from a newer app version. Please update first.' : 'النسخة من نسخة برنامج أحدث. حدّث البرنامج أول.'
    case 'backup_not_nuqta': return isEn ? 'This file is not a valid Nuqta backup.' : 'هذا الملف مش نسخة من نُقطة.'
    case 'backup_missing': return isEn ? 'Backup file not found.' : 'ما لقينا النسخة.'
    case 'backup_no_db': return isEn ? 'Database is closed; cannot take a backup.' : 'قاعدة البيانات مش فاتحة، فما بنقدر ناخذ نسخة.'
    default: return isEn ? 'An error occurred, please try again.' : 'صار خطأ، جرّب مرة ثانية.'
  }
}

/** قائمة النسخ والاسترجاع. */
export function RestoreList({ compact }: { compact?: boolean }) {
  const { state } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const [n, setN] = useState(0)
  const list = useApi(() => api.backups(), [n])
  const [target, setTarget] = useState<BackupInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const items = list.state === 'ready' ? list.data.items : []
  const shown = compact ? items.slice(0, 5) : items
  const kindLabels = getKindLabels(isEn)

  return (
    <div className="restore">
      {list.state === 'ready' && !items.length && <span className="sub">{isEn ? 'No backups on this device yet.' : 'ما في نسخ على هالجهاز لسا.'}</span>}
      {shown.map((b) => (
        <div key={b.file} className="restore-row">
          <div><strong>{when(b.at, isEn)}</strong> <span className="sub small">{kindLabels[b.kind]} · {size(b.size)}</span></div>
          <button type="button" className="btn btn-d sm" onClick={() => { setErr(''); setTarget(b) }}>{isEn ? 'Restore' : 'استرجع'}</button>
        </div>
      ))}
      <button type="button" className="btn btn-s" style={{ alignSelf: 'flex-start' }} onClick={async () => {
        const r = await api.restoreFromFile()
        if (!r.ok) return say(backupError(r.error.code, isEn))
        if ('restarting' in r.value) say(isEn ? 'Restored backup. App will restart.' : 'رجعنا للنسخة. البرنامج بيعيد التشغيل.')
        else setN((x) => x + 1)
      }}>{isEn ? 'Restore from File' : 'استرجع من ملف'}</button>
      {target && (
        <Dialog title={t('dlg.restore.title', { when: when(target.at, isEn) })} body={t('dlg.restore.body')} okLabel={isEn ? 'Restore' : 'استرجع'} danger
          busy={busy} busyLabel={isEn ? 'Restoring...' : 'جاري الاسترجاع'} error={err} onCancel={() => setTarget(null)}
          onOk={async () => {
            setBusy(true)
            const r = await api.restoreBackup(target.file)
            if (!r.ok) {
              setBusy(false)
              return setErr(backupError(r.error.code, isEn))
            }
            say(isEn ? 'Restored backup. App will restart.' : 'رجعنا للنسخة. البرنامج بيعيد التشغيل.')
          }} />
      )}
    </div>
  )
}

export function BackupTab() {
  const { state } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const [n, setN] = useState(0)
  const list = useApi(() => api.backups(), [n])
  const [busy, setBusy] = useState(false)
  const last = list.state === 'ready' ? list.data.items[0] : undefined

  return (
    <section className="scr backup-grid" aria-label={isEn ? 'Backup & Restore' : 'النسخ والاستعادة'}>
      <div className="card backup-card">
        <h2 className="h2">{isEn ? 'Local Backup' : 'نسخة على هذا الجهاز'}</h2>
        <div>{isEn ? 'Latest backup: ' : 'آخر نسخة: '}<strong>{last ? when(last.at, isEn) : (isEn ? 'None yet' : 'ما في لسا')}</strong></div>
        <span className="sub small">{isEn ? 'Daily automated backups are retained for 30 days. Manual backups are never deleted.' : 'البرنامج بياخذ نسخة تلقائية كل يوم، وبيحتفظ بآخر 30. النسخ اليدوية ما بتنحذف.'}</span>
        <div className="row-btns">
          <button type="button" className="btn btn-p" disabled={busy} onClick={() => {
            setBusy(true)
            void api.backupNow().then((r) => {
              setBusy(false)
              if (!r.ok) return say(backupError(r.error.code, isEn))
              say(isEn ? 'Backup created.' : 'انأخذت نسخة.')
              setN((x) => x + 1)
            })
          }}>
            {busy && <span className="spin" aria-hidden="true" />}
            {busy ? (isEn ? 'Backing up...' : 'جاري النسخ') : (isEn ? 'Backup Now' : 'خذ نسخة الآن')}
          </button>
          <button type="button" className="btn btn-s" onClick={async () => {
            const r = await api.saveBackupAs()
            if (!r.ok) return say(backupError(r.error.code, isEn))
            if ('path' in r.value) say(isEn ? 'Backup saved.' : 'انحفظت النسخة.')
          }}>{isEn ? 'Export Backup to Folder...' : 'احفظ نسخة بمكان ثاني'}</button>
        </div>
        <span className="sub small">{isEn ? 'Tip: Save backups to an external USB drive periodically for safety.' : 'ما في نسخ سحابي لسا. احفظ نسخة على فلاشة من وقت لوقت.'}</span>
      </div>
      <div className="card backup-card">
        <h2 className="h2">{isEn ? 'Restore Backup' : 'استرجاع نسخة'}</h2>
        <p style={{ margin: 0 }}>{isEn ? 'Restoring reverts all accounts and records to the backup date. A backup of the current state will be created first.' : 'الاسترجاع بيرجع كل الحسابات لتاريخ النسخة. الحركات الأحدث منها بتروح، بس بناخذ نسخة من الوضع الحالي قبل.'}</p>
        <RestoreList key={n} />
      </div>
    </section>
  )
}
