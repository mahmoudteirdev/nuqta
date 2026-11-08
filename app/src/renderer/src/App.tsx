import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { SCREENS } from '@/screens'
import { Setup } from '@/screens/Setup'
import { Login } from '@/screens/Login'
import { UpdateBanner } from '@/shell/UpdatesTab'
import { OWNER_SCREENS } from '@shared/permissions'
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

/** بيقفل البرنامج بعد دقائق بدون حركة. 0 = ما بيقفل. */
function useIdleLock(minutes: number): void {
  const { dispatch } = useStore()
  useEffect(() => {
    if (!minutes) return
    let last = Date.now()
    const touch = () => { last = Date.now() }
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const timer = setInterval(async () => {
      if (Date.now() - last < minutes * 60_000) return
      await api.logout()
      dispatch({ type: 'status', status: await api.status() })
    }, 15_000)
    return () => {
      clearInterval(timer)
      events.forEach((e) => window.removeEventListener(e, touch))
    }
  }, [minutes, dispatch])
}

export function App() {
  const { state, dispatch } = useStore()
  useLiveStatus()
  const setup = state.status?.setup.needed ? state.status.setup : null
  const view = (setup ? 'setup:' : '') + (state.status?.session.user?.id ?? 'out') + ':' + state.stateMode + ':' + state.screen + ':' + state.cardCode
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
  // الشاشة اللي الدور ما بيسمح فيها (مثلا بعد ما دخل فني) بترجع للرئيسية.
  useEffect(() => {
    const role = state.status?.session.user?.role
    if (role === 'technician' && OWNER_SCREENS.has(state.screen)) dispatch({ type: 'go', screen: 'home' })
  }, [state.status?.session.user?.role, state.screen, dispatch])

  useIdleLock(state.status?.session.user ? state.status.session.lockAfterMinutes : 0)

  // لحد ما توصل الحالة ما منعرف مين داخل، فما منفتح ولا شاشة.
  if (!state.status) return <div className="app" />

  // إذا في رموز محفوظة، المعالج نفسه بدو دخول.
  const session = state.status.session
  if (setup && db?.ok && (session.user || session.needsOwnerPin)) {
    return (
      <div className="app">
        {state.status?.dev && <DevBar />}
        <Setup initial={setup.step} />
      </div>
    )
  }

  if (db?.ok && state.status && !state.status.session.user) {
    return (
      <div className="app">
        {state.status.dev && <DevBar />}
        <Login session={state.status.session} network={state.status.networkName} />
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
          <UpdateBanner />
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
