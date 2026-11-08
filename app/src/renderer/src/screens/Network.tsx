import { useEffect, useState } from 'react'
import type { NetworkData } from '@shared/api'
import { api } from '@/lib/api'
import { connectError, errorText } from '@/lib/actions'
import { leftText } from '@/lib/format'
import { t } from '@/lib/i18n'
import { getEmpty } from '@/lib/screens'
import { useStore } from '@/lib/store'
import { useApi } from '@/lib/useApi'
import { Dialog } from '@/shell/Dialog'
import { ExtendDialog } from '@/shell/ExtendDialog'
import { StateView } from '@/shell/StateView'
import { useToast } from '@/shell/Toast'

/** المتصلين بيتغيروا كل دقيقة، فبنعيد القراءة طول ما الشاشة مفتوحة. */
const REFRESH_MS = 10_000

function lastSeen(iso: string | null, isEn: boolean): string {
  if (!iso) return isEn ? 'Unreachable' : 'ما ردّ لسا'
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60_000)
  if (mins < 1) return t('network.lastSeenMoments')
  if (mins < 60) return t('network.lastSeenMins', { m: mins })
  const clock = new Intl.DateTimeFormat(isEn ? 'en-US' : 'ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' })
  const dayMonth = new Intl.DateTimeFormat(isEn ? 'en-US' : 'ar-u-nu-latn', { day: 'numeric', month: 'long' })
  const at = new Date().toDateString() === d.toDateString() ? clock.format(d) : dayMonth.format(d)
  return t('network.lastSeenAt', { at })
}

function ConnectDialog({ onDone, onCancel }: { onDone: (name: string) => void; onCancel: () => void }) {
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog title={t('network.connect.title')} okLabel={t('network.connect.ok')} busy={busy} busyLabel={t('network.connect.busy')} error={err} onCancel={onCancel}
      body={t('network.connect.body')}
      onOk={async () => {
        if (!host.trim()) return setErr(t('err.routerIp'))
        if (!user.trim() || !pass) return setErr(t('err.routerCreds'))
        setBusy(true)
        const r = await api.connectRouter({ host, user, password: pass })
        setBusy(false)
        if (!r.ok) return setErr(connectError(r.error.code))
        setPass('')
        onDone(r.value.name)
      }}>
      <div className="fld"><label className="lbl" htmlFor="rip">{t('network.connect.ip')}</label><div className="box" dir="ltr"><input id="rip" value={host} placeholder="192.168.88.1" onChange={(e) => { setHost(e.target.value); setErr('') }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="run">{t('network.connect.user')}</label><div className="box" dir="ltr"><input id="run" value={user} autoComplete="off" onChange={(e) => { setUser(e.target.value); setErr('') }} /></div></div>
      <div className="fld"><label className="lbl" htmlFor="rpw">{t('network.connect.pass')}</label><div className="box" dir="ltr"><input id="rpw" type="password" value={pass} autoComplete="off" onChange={(e) => { setPass(e.target.value); setErr('') }} /></div></div>
    </Dialog>
  )
}

type Session = NonNullable<NetworkData['sessions']>[number]

export function Network() {
  const { state, dispatch } = useStore()
  const isEn = state.lang === 'en'
  const say = useToast()
  const [n, setN] = useState(0)
  const net = useApi(() => api.network(), [n])
  const [connect, setConnect] = useState(false)
  const [kick, setKick] = useState<Session | null>(null)
  const [kickBusy, setKickBusy] = useState(false)
  const [kickErr, setKickErr] = useState('')
  const [extending, setExtending] = useState<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  if (net.state === 'loading') return <StateView screen="network" mode="loading" />
  if (net.state === 'error') return <StateView screen="network" mode="error" onRetry={net.retry} />
  const d = net.data

  const connectDlg = connect && (
    <ConnectDialog onCancel={() => setConnect(false)} onDone={async (name) => {
      setConnect(false)
      say(t('network.connect.connected', { name }))
      dispatch({ type: 'status', status: await api.status() })
      setN((x) => x + 1)
    }} />
  )

  if (!d.routers.length) {
    const empty = getEmpty('network', state.lang)
    return (
      <div className="card scr state-empty">
        <h1>{empty.title}</h1>
        <p>{empty.body}</p>
        <button type="button" className="btn btn-p" onClick={() => setConnect(true)}>{empty.cta}</button>
        {connectDlg}
      </div>
    )
  }

  return (
    <div className="scr stack" style={{ gap: 24 }}>
      <header className="head" style={{ alignItems: 'center', gap: 16 }}>
        <h1 className="h1">{t('network.title')}</h1>
        <button type="button" className="btn btn-s" onClick={() => setConnect(true)}>{d.configured ? t('network.changeRouter') : t('network.connectRouter')}</button>
      </header>

      <section aria-label="الأجهزة" className="devices">
        {d.routers.map((r) => (
          <div key={r.id} className="card device">
            <div className="device-head"><strong>{r.name}</strong><span className="mono">{r.host}</span></div>
            <div className={r.up ? 'bn ok device-state' : 'bn er device-state'}>
              {r.up ? t('network.connected', { n: r.sessions ?? 0 }) : `${t('network.down')} ${lastSeen(r.lastSeenAt, isEn)}`}
            </div>
            {d.mock && <span className="sub small">{t('network.mockSub')}</span>}
          </div>
        ))}
        <div className="card device">
          <div className="device-head"><strong>{t('network.queueTitle')}</strong></div>
          <div className={d.queued ? 'bn wa device-state' : 'bn ok device-state'}>
            {d.queued ? t('network.queueBusy', { n: d.queued }) : t('network.queueEmpty')}
          </div>
        </div>
      </section>

      <section aria-labelledby="on" className="panel">
        <div className="panel-head">
          <h2 id="on" className="h2">{d.sessions ? t('network.sessionsTitle', { n: d.sessions.length }) : t('network.sessionsTitleNone')}</h2>
        </div>
        {!d.sessions ? (
          <div className="empty-row bordered">
            <strong>{t('network.sessionsFail')}</strong>
            <span className="sub">{t('network.sessionsFailSub')}</span>
          </div>
        ) : !d.sessions.length ? (
          <div className="empty-row bordered">{t('network.sessionsEmpty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }} tabIndex={0} role="group" aria-label={t('network.sessionsTitleNone')}>
            <div role="table" aria-label={t('network.sessionsTitleNone')} style={{ minWidth: 760 }}>
              <div role="row" className="ses thead">
                <span role="columnheader">{t('network.colCard')}</span>
                <span role="columnheader">{t('network.colCategory')}</span>
                <span role="columnheader">{t('network.colRouter')}</span>
                <span role="columnheader">{t('network.colIp')}</span>
                <span role="columnheader">{t('network.colTimeLeft')}</span>
                <span role="columnheader" className="kick-col"><span className="sr">{t('network.colActions')}</span></span>
              </div>
              {d.sessions.map((s) => (
                <div key={s.id} role="row" className="ses">
                  <span role="cell" className="mono">{s.code}</span>
                  <span role="cell">{s.categoryName ?? '—'}</span>
                  <span role="cell">{s.routerName}</span>
                  <span role="cell" className="mono">{s.address}</span>
                  <span role="cell">{s.isUnlimited ? t('network.unlimited') : leftText(s.secondsLeft, null, state.lang)}</span>
                  <span role="cell" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button type="button" className="btn btn-s sm" onClick={() => setExtending(s.code)}>{t('network.btnExtend')}</button>
                    <button type="button" className="btn btn-d sm kick-col" aria-label={`${t('network.btnKick')} ${s.code}`} onClick={() => { setKickErr(''); setKick(s) }}>{t('network.btnKick')}</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {connectDlg}

      {extending && (
        <ExtendDialog
          code={extending}
          onCancel={() => setExtending(null)}
          onDone={() => {
            setExtending(null)
            setN((x) => x + 1)
          }}
        />
      )}
      {kick && (
        <Dialog title={t('dlg.kick.title', { code: kick.code })} body={t('dlg.kick.body')} okLabel={t('dlg.kick.ok')} danger
          busy={kickBusy} busyLabel="جاري الفصل" error={kickErr} onCancel={() => setKick(null)}
          onOk={async () => {
            setKickBusy(true)
            const r = await api.kickSession(kick.id)
            setKickBusy(false)
            if (!r.ok) return setKickErr(r.error.code === 'unreachable' || r.error.code === 'timeout' ? t('err.routerDown') : errorText(r.error))
            say(t('toast.kicked', { code: kick.code }))
            setKick(null)
            setN((x) => x + 1)
          }} />
      )}
    </div>
  )
}
