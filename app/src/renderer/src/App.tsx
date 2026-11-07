import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { SCREENS } from '@/screens'
import { Setup } from '@/screens/Setup'
import { RestoreList } from '@/shell/Backups'
import { DevBar } from '@/shell/DevBar'
import { Sidebar } from '@/shell/Sidebar'
import { StatusBar } from '@/shell/StatusBar'
import { StateView } from '@/shell/StateView'

const STATUS_EVERY_MS = 5_000

function focusTitle(): void {
  const h = document.querySelector<HTMLElement>('main h1:not(.sr)') ?? document.querySelector<HTMLElement>('main h1')
  if (!h) return
  h.setAttribute('tabindex', '-1')
  h.focus()
}

/** حالة الراوتر من العملية الرئيسية، والنت من المتصفح. */
function useLiveStatus(): void {
  const { dispatch } = useStore()
  useEffect(() => {
    let live = true
    const poll = () => api.status().then((s) => live && dispatch({ type: 'status', status: s }), () => {})
    void poll()
    const timer = setInterval(poll, STATUS_EVERY_MS)
    const on = () => dispatch({ type: 'net', up: true })
    const off = () => dispatch({ type: 'net', up: false })
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener('focus', poll)
    return () => {
      live = false
      clearInterval(timer)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener('focus', poll)
    }
  }, [dispatch])
}

/** قاعدة بيانات تالفة: خيار الاسترجاع هون، وبدون مسح (HANDOFF القسم 7). */
function DbError({ reason }: { reason: string }) {
  return (
    <div className="stack">
      <div className="card scr state-err" role="alert">
        <h1>{reason === 'too_new' ? 'قاعدة البيانات من نسخة أحدث من البرنامج' : 'ما قدرنا نفتح قاعدة البيانات'}</h1>
        <p>{reason === 'too_new' ? 'بياناتك ما انمسحت. حدّث البرنامج.' : 'بياناتك ما انمسحت. استرجع آخر نسخة سليمة، والملف الحالي بيضل محفوظ على جنب.'}</p>
      </div>
      {reason !== 'too_new' && (
        <section className="card" aria-label="استرجاع نسخة">
          <h2 className="h2">استرجع نسخة</h2>
          <RestoreList compact />
        </section>
      )}
    </div>
  )
}

export function App() {
  const { state } = useStore()
  useLiveStatus()
  const setup = state.status?.setup.needed ? state.status.setup : null
  const view = (setup ? 'setup:' : '') + state.stateMode + ':' + state.screen + ':' + state.cardCode
  const first = useRef(true)

  // تغيير الشاشة بينقل التركيز للعنوان، وبيغير عنوان النافذة.
  // العنوان ممكن يوصل بعد ما تخلص القراءة، فبنراقبه لحين ما يظهر.
  useEffect(() => {
    let focused = first.current
    first.current = false
    const sync = () => {
      // عنوان التحميل المخفي (.sr) ما بياخذ التركيز: بيختفي لما توصل البيانات.
      const h = document.querySelector('main h1:not(.sr)')
      document.title = h ? 'نقطة: ' + h.textContent : 'نقطة'
      if (h && !focused) {
        focused = true
        focusTitle()
      }
    }
    sync()
    const main = document.querySelector('main')
    if (!main) return
    const mo = new MutationObserver(sync)
    mo.observe(main, { childList: true, subtree: true, characterData: true })
    return () => mo.disconnect()
  }, [view])

  const Screen = SCREENS[state.screen]
  const db = state.status?.db
  if (setup && db?.ok) {
    return (
      <div className="app">
        {state.status?.dev && <DevBar />}
        <Setup initial={setup.step} />
      </div>
    )
  }

  return (
    <div className="app">
      {state.status?.dev && <DevBar />}
      <div className="shell">
        <button type="button" className="btn btn-p skip" onClick={focusTitle}>انتقل للمحتوى</button>
        <Sidebar />
        <main className="main">
          <StatusBar />
          <div className="mainpad" key={view}>
            {db && !db.ok ? <DbError reason={db.reason} />
              : state.stateMode === 'normal' ? <Screen />
              : <StateView screen={state.screen} mode={state.stateMode} />}
          </div>
        </main>
      </div>
    </div>
  )
}
