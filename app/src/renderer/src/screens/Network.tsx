import { useEffect, useState } from 'react'
import type { NetworkData, NetworkPool } from '@shared/api'
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

function PoolDialog({
  pool,
  isEn,
  onDone,
  onCancel
}: {
  pool?: NetworkPool | null
  isEn: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(pool?.name ?? '')
  const [ranges, setRanges] = useState(pool?.ranges ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const isEdit = !!pool

  return (
    <Dialog
      title={isEdit ? t('network.editPool') : t('network.addPool')}
      okLabel={isEdit ? t('common.save') : (isEn ? 'Add' : 'إضافة')}
      busy={busy}
      error={err}
      onCancel={onCancel}
      body={isEdit ? (isEn ? `Edit IP address range for pool "${pool.name}".` : `تعديل نطاق العناوين للـ Pool (${pool.name}).`) : (isEn ? 'Add a new IP Pool to the router.' : 'إضافة IP Pool جديد على الراوتر.')}
      onOk={async () => {
        if (!name.trim()) return setErr(isEn ? 'Enter pool name' : 'اكتب اسم الـ Pool')
        if (!ranges.trim()) return setErr(isEn ? 'Enter address range (e.g. 192.168.88.10-192.168.88.254)' : 'اكتب نطاق العناوين (مثال: 192.168.88.10-192.168.88.254)')
        setBusy(true)
        const r = await api.savePool({ id: pool?.id, name: name.trim(), ranges: ranges.trim() })
        setBusy(false)
        if (!r.ok) return setErr(errorText(r.error))
        onDone()
      }}
    >
      <div className="fld">
        <label className="lbl" htmlFor="pname">{t('network.poolName')}</label>
        <div className="box" dir="ltr">
          <input
            id="pname"
            value={name}
            disabled={isEdit}
            placeholder="pool-wifi"
            onChange={(e) => { setName(e.target.value); setErr('') }}
          />
        </div>
      </div>
      <div className="fld">
        <label className="lbl" htmlFor="pranges">{t('network.poolRanges')}</label>
        <div className="box" dir="ltr">
          <input
            id="pranges"
            value={ranges}
            placeholder={t('network.poolRangesHint')}
            onChange={(e) => { setRanges(e.target.value); setErr('') }}
          />
        </div>
      </div>
    </Dialog>
  )
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

  const [poolModal, setPoolModal] = useState<NetworkPool | 'new' | null>(null)
  const [deletingPool, setDeletingPool] = useState<NetworkPool | null>(null)
  const [delPoolBusy, setDelPoolBusy] = useState(false)
  const [selectedPool, setSelectedPool] = useState<string | null>(null)
  const [poolView, setPoolView] = useState<'table' | 'cards'>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('nuqta_pool_view')
      if (saved === 'cards' || saved === 'table') return saved
    }
    return 'table'
  })

  const changePoolView = (mode: 'table' | 'cards') => {
    setPoolView(mode)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('nuqta_pool_view', mode)
    }
  }

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

  const allSessions = d.sessions
  const displayedSessions = allSessions
    ? (selectedPool ? allSessions.filter((s) => s.poolName === selectedPool) : allSessions)
    : null

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

      {/* نطاقات الآي بي (IP Pools) */}
      <section aria-label={t('network.poolsTitle')} className="panel">
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 className="h2">{t('network.poolsTitle')}</h2>
            <span className="sub small">{isEn ? 'Manage IP address pools, consumption, and server matching (Wi-Fi / LAN)' : 'إدارة نطاقات الآي بي ومتابعة الاستهلاك ومطابقة السيرفرات (Wi-Fi / LAN)'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {d.pools && d.pools.length > 0 && (
              <div style={{ display: 'flex', gap: '2px', background: 'var(--fill)', padding: '2px', borderRadius: '4px' }}>
                <button
                  type="button"
                  className={`btn sm ${poolView === 'table' ? 'btn-s' : 'btn-g'}`}
                  style={{ minHeight: '30px', padding: '0 10px', fontSize: '13px', background: poolView === 'table' ? '#fff' : 'transparent', border: poolView === 'table' ? '1px solid var(--line)' : 'none' }}
                  onClick={() => changePoolView('table')}
                  title={t('network.viewTable')}
                >
                  {t('network.viewTable')}
                </button>
                <button
                  type="button"
                  className={`btn sm ${poolView === 'cards' ? 'btn-s' : 'btn-g'}`}
                  style={{ minHeight: '30px', padding: '0 10px', fontSize: '13px', background: poolView === 'cards' ? '#fff' : 'transparent', border: poolView === 'cards' ? '1px solid var(--line)' : 'none' }}
                  onClick={() => changePoolView('cards')}
                  title={t('network.viewCards')}
                >
                  {t('network.viewCards')}
                </button>
              </div>
            )}
            <button type="button" className="btn btn-s sm" onClick={() => setPoolModal('new')}>{t('network.addPool')}</button>
          </div>
        </div>

        {d.pools && d.pools.length > 0 ? (
          (() => {
            const sortedPools = [...d.pools].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
            if (poolView === 'table') {
              return (
                <div style={{ overflowX: 'auto' }} tabIndex={0} role="group" aria-label={t('network.poolsTitle')}>
                  <div role="table" aria-label={t('network.poolsTitle')} style={{ minWidth: 840 }}>
                    <div role="row" className="pool-row thead">
                      <span role="columnheader">{t('network.poolName')}</span>
                      <span role="columnheader">{t('network.poolServer')}</span>
                      <span role="columnheader">{t('network.colRange')}</span>
                      <span role="columnheader">{t('network.colCapacity')}</span>
                      <span role="columnheader">{t('network.colConsumption')}</span>
                      <span role="columnheader"><span className="sr">{t('network.colActions')}</span></span>
                    </div>
                    {sortedPools.map((p) => {
                      const pct = p.totalIps > 0 ? Math.min(100, Math.round((p.activeCount / p.totalIps) * 100)) : 0
                      const barColor = pct > 90 ? 'var(--err)' : pct > 75 ? 'var(--warn)' : 'var(--pri)'
                      const freeCount = Math.max(0, p.totalIps - p.activeCount)
                      const isFiltered = selectedPool === p.name
                      return (
                        <div key={p.name} role="row" className="pool-row" style={{ background: isFiltered ? 'var(--pri-t)' : undefined }}>
                          <div role="cell" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: barColor, flex: 'none' }} />
                            <strong>{p.name}</strong>
                          </div>
                          <div role="cell">
                            {p.serverName ? (
                              <span className="bn ok sm" style={{ fontSize: '11px', padding: '2px 8px' }}>{p.serverName}</span>
                            ) : (
                              <span className="sub">—</span>
                            )}
                          </div>
                          <div role="cell">
                            <code className="mono" dir="ltr" style={{ fontSize: '12px', background: 'var(--fill)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--line)' }}>
                              {p.ranges}
                            </code>
                          </div>
                          <div role="cell" style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <span className="mono bold">{p.activeCount} / {p.totalIps}</span>
                            <span className="sub small" style={{ fontSize: '12px' }}>({t('network.freeIps', { n: freeCount })})</span>
                          </div>
                          <div role="cell" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '7px', background: 'var(--fill)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width 0.3s' }} />
                            </div>
                            <span className="mono bold" style={{ fontSize: '12px', minWidth: '36px', color: pct > 85 ? 'var(--err)' : 'var(--ink)' }}>
                              {pct}%
                            </span>
                          </div>
                          <div role="cell" style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
                            {p.activeCount > 0 && (
                              <button
                                type="button"
                                className={`btn sm ${isFiltered ? 'btn-p' : 'btn-s'}`}
                                style={{ fontSize: '12px', minHeight: '32px', padding: '0 8px' }}
                                onClick={() => setSelectedPool(isFiltered ? null : p.name)}
                                title={isFiltered ? t('network.filterPoolActive') : t('network.filterPool')}
                              >
                                {isFiltered ? t('network.filterPoolActive') : t('network.filterPool')}
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-g sm"
                              style={{ fontSize: '12px', minHeight: '32px', padding: '0 8px', border: '1px solid var(--line)', background: '#fff' }}
                              onClick={() => setPoolModal(p)}
                            >
                              {t('network.editPool')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-d sm"
                              style={{ fontSize: '12px', minHeight: '32px', padding: '0 8px' }}
                              onClick={() => setDeletingPool(p)}
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }

            return (
              <div className="pool-grid">
                {sortedPools.map((p) => {
                  const pct = p.totalIps > 0 ? Math.min(100, Math.round((p.activeCount / p.totalIps) * 100)) : 0
                  const barColor = pct > 90 ? 'var(--err)' : pct > 75 ? 'var(--warn)' : 'var(--pri)'
                  const freeCount = Math.max(0, p.totalIps - p.activeCount)
                  const isFiltered = selectedPool === p.name
                  return (
                    <div key={p.name} className="pool-card" style={{ borderColor: isFiltered ? 'var(--pri)' : 'var(--line)', background: isFiltered ? 'var(--pri-t)' : '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: barColor, flex: 'none' }} />
                            <strong style={{ fontSize: '16px' }}>{p.name}</strong>
                          </div>
                          {p.serverName && (
                            <div style={{ marginTop: '4px' }}>
                              <span className="bn ok sm" style={{ fontSize: '11px', padding: '1px 6px' }}>{p.serverName}</span>
                            </div>
                          )}
                        </div>
                        <span className={`bn ${pct > 90 ? 'er' : pct > 75 ? 'wa' : 'ok'} sm`} style={{ fontSize: '12px', fontWeight: 600 }}>
                          {pct}%
                        </span>
                      </div>

                      <div className="mono small" dir="ltr" style={{ background: 'var(--fill)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                        {p.ranges}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ width: '100%', height: '8px', background: 'var(--fill)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: barColor, transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)' }}>
                          <span><strong>{p.activeCount}</strong> / {p.totalIps} {t('network.poolActive', { n: '' }).trim()}</span>
                          <span>{t('network.freeIps', { n: freeCount })}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: '10px', marginTop: '2px' }}>
                        <div>
                          {p.activeCount > 0 ? (
                            <button
                              type="button"
                              className="lnk"
                              style={{ fontSize: '12px' }}
                              onClick={() => setSelectedPool(isFiltered ? null : p.name)}
                            >
                              {isFiltered ? t('network.filterPoolActive') : `${t('network.filterPool')} (${p.activeCount})`}
                            </button>
                          ) : (
                            <span className="sub small" style={{ fontSize: '11px' }}>{isEn ? 'No users' : 'لا يوجد متصلين'}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-g sm"
                            style={{ fontSize: '12px', minHeight: '30px', padding: '0 8px', border: '1px solid var(--line)', background: '#fff' }}
                            onClick={() => setPoolModal(p)}
                          >
                            {t('network.editPool')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-d sm"
                            style={{ fontSize: '12px', minHeight: '30px', padding: '0 8px' }}
                            onClick={() => setDeletingPool(p)}
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()
        ) : (
          <div className="empty-row bordered">{isEn ? 'No pools defined on the router.' : 'لا توجد Pools معرفة على الراوتر.'}</div>
        )}
      </section>

      {/* المتصلين الآن */}
      <section aria-labelledby="on" className="panel">
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h2 id="on" className="h2">{allSessions ? t('network.sessionsTitle', { n: allSessions.length }) : t('network.sessionsTitleNone')}</h2>

          {/* فلاتر الـ Pools */}
          {d.pools && d.pools.length > 0 && allSessions && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn sm ${selectedPool === null ? 'btn-p' : 'btn-g'}`}
                style={{ fontSize: '12px' }}
                onClick={() => setSelectedPool(null)}
              >
                {t('network.filterAll')} ({allSessions.length})
              </button>
              {[...d.pools].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`btn sm ${selectedPool === p.name ? 'btn-p' : 'btn-g'}`}
                  style={{ fontSize: '12px' }}
                  onClick={() => setSelectedPool(p.name)}
                >
                  {p.name} ({p.activeCount})
                </button>
              ))}
            </div>
          )}
        </div>

        {!displayedSessions ? (
          <div className="empty-row bordered">
            <strong>{t('network.sessionsFail')}</strong>
            <span className="sub">{t('network.sessionsFailSub')}</span>
          </div>
        ) : !displayedSessions.length ? (
          <div className="empty-row bordered">{selectedPool ? `لا يوجد متصلين حالياً على ${selectedPool}.` : t('network.sessionsEmpty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }} tabIndex={0} role="group" aria-label={t('network.sessionsTitleNone')}>
            <div role="table" aria-label={t('network.sessionsTitleNone')} style={{ minWidth: 840 }}>
              <div role="row" className="ses thead">
                <span role="columnheader">{t('network.colCard')}</span>
                <span role="columnheader">{t('network.colCategory')}</span>
                <span role="columnheader">{t('network.colPool')}</span>
                <span role="columnheader">{t('network.colRouter')}</span>
                <span role="columnheader">{t('network.colIp')}</span>
                <span role="columnheader">{t('network.colTimeLeft')}</span>
                <span role="columnheader" className="kick-col"><span className="sr">{t('network.colActions')}</span></span>
              </div>
              {displayedSessions.map((s) => (
                <div key={s.id} role="row" className="ses">
                  <span role="cell" className="mono">{s.code}</span>
                  <span role="cell">{s.categoryName ?? '—'}</span>
                  <span role="cell">
                    {s.poolName ? (
                      <span className="bn ok sm" style={{ fontSize: '11px', padding: '1px 6px' }}>{s.poolName}</span>
                    ) : '—'}
                  </span>
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

      {poolModal && (
        <PoolDialog
          pool={poolModal === 'new' ? null : poolModal}
          isEn={isEn}
          onCancel={() => setPoolModal(null)}
          onDone={() => {
            setPoolModal(null)
            say(isEn ? 'Pool saved successfully.' : 'تم حفظ الـ Pool بنجاح.')
            setN((x) => x + 1)
          }}
        />
      )}

      {deletingPool && (
        <Dialog
          title={isEn ? `Delete Pool ${deletingPool.name}` : `حذف Pool ${deletingPool.name}`}
          body={isEn ? `Are you sure you want to delete pool "${deletingPool.name}" from router? Ensure it is not in use by Hotspot or DHCP servers.` : `هل أنت متأكد من حذف الـ Pool (${deletingPool.name}) من الراوتر؟ تأكد من عدم اعتماده في سيرفرات الهوتسبوت أو الـ DHCP.`}
          okLabel={isEn ? 'Yes, Delete' : 'نعم، احذف'}
          danger
          busy={delPoolBusy}
          onCancel={() => setDeletingPool(null)}
          onOk={async () => {
            setDelPoolBusy(true)
            const r = await api.deletePool(deletingPool.name)
            setDelPoolBusy(false)
            if (!r.ok) return say(errorText(r.error))
            say(isEn ? `Deleted pool ${deletingPool.name} from router.` : `تم حذف ${deletingPool.name} من الراوتر.`)
            setDeletingPool(null)
            setN((x) => x + 1)
          }}
        />
      )}

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
