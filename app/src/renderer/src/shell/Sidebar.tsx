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
        {NAV.map((n) => {
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
    </nav>
  )
}
