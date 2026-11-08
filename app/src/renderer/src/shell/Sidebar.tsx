import { OWNER_SCREENS } from '@shared/permissions'
import { api } from '@/lib/api'
import { NAV } from '@/lib/screens'
import { useStore } from '@/lib/store'
import { Logo, NavIcon } from './icons'

export function Sidebar() {
  const { state, dispatch } = useStore()
  return (
    <nav className="sidenav" aria-label="القائمة الرئيسية">
      <div className="brand">
        <Logo />
        <strong>{state.status?.networkName ?? 'نقطة'}</strong>
      </div>
      <div className="navlist">
        {NAV.filter((n) => state.status?.session.user?.role === 'owner' || !OWNER_SCREENS.has(n.id)).map((n) => {
          const on = state.screen === n.id
          const Icon = NavIcon[n.id]
          return (
            <button key={n.id} type="button" className={on ? 'ni on' : 'ni'} aria-current={on ? 'page' : undefined}
              onClick={() => dispatch({ type: 'go', screen: n.id })}>
              <Icon />
              {n.label}
            </button>
          )
        })}
      </div>
      {state.status?.session.user && (
        <div className="who">
          <span><span className="sr">داخل: </span>{state.status.session.user.name}</span>
          <button type="button" className="btn btn-g sm who-lock" onClick={async () => {
            await api.logout()
            dispatch({ type: 'status', status: await api.status() })
          }}>قفل</button>
        </div>
      )}
    </nav>
  )
}
