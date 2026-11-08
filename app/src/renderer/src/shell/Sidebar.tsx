import { OWNER_SCREENS } from '@shared/permissions'
import { api } from '@/lib/api'
import { getNav } from '@/lib/screens'
import { useStore } from '@/lib/store'
import { Logo, NavIcon } from './icons'

export function Sidebar() {
  const { state, dispatch } = useStore()
  const isEn = state.lang === 'en'
  const navItems = getNav(state.lang)

  return (
    <nav className="sidenav" aria-label={isEn ? 'Main Navigation' : 'القائمة الرئيسية'}>
      <div className="brand">
        <Logo />
        <strong>{(state.status?.networkName && state.status.networkName !== 'نقطة') ? state.status.networkName : (isEn ? 'Nuqta' : 'نقطة')}</strong>
      </div>
      <div className="navlist">
        {navItems.filter((n) => state.status?.session.user?.role === 'owner' || !OWNER_SCREENS.has(n.id)).map((n) => {
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
          <span><span className="sr">{isEn ? 'Signed in as: ' : 'داخل: '}</span>{state.status.session.user.name}</span>
          <button type="button" className="btn btn-g sm who-lock" onClick={async () => {
            await api.logout()
            dispatch({ type: 'status', status: await api.status() })
          }}>{isEn ? 'Lock' : 'قفل'}</button>
        </div>
      )}
    </nav>
  )
}
