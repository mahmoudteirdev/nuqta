import { useId, useRef, type ReactNode } from 'react'

/**
 * تبويبات بتركيز متنقل (HANDOFF القسم 11). بالأسهم حسب RTL: اليسار التالي، واليمين السابق.
 * Home وEnd لأول وآخر تبويب.
 */
export function Tabs<K extends string>(p: {
  label: string
  tabs: { key: K; name: string }[]
  current: K
  onChange: (k: K) => void
  children: ReactNode
}) {
  const id = useId()
  const list = useRef<HTMLDivElement>(null)
  const i = p.tabs.findIndex((t) => t.key === p.current)

  const move = (to: number) => {
    const n = p.tabs.length
    const k = p.tabs[((to % n) + n) % n]!.key
    p.onChange(k)
    setTimeout(() => list.current?.querySelector<HTMLElement>(`[data-key="${k}"]`)?.focus(), 0)
  }

  return (
    <>
      <div ref={list} className="tabs" role="tablist" aria-label={p.label}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') move(i + 1)
          else if (e.key === 'ArrowRight') move(i - 1)
          else if (e.key === 'Home') move(0)
          else if (e.key === 'End') move(p.tabs.length - 1)
          else return
          e.preventDefault()
        }}>
        {p.tabs.map((t) => {
          const on = t.key === p.current
          return (
            <button key={t.key} type="button" role="tab" data-key={t.key} id={`${id}-${t.key}`} className={on ? 'tab on' : 'tab'}
              aria-selected={on} aria-controls={`${id}-panel`} tabIndex={on ? 0 : -1} onClick={() => p.onChange(t.key)}>
              {t.name}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${p.current}`} tabIndex={-1} className="tabpanel">
        {p.children}
      </div>
    </>
  )
}
