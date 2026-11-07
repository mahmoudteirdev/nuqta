import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * حوار (HANDOFF القسم 11): بيحبس التركيز، Esc بيسكره إلا لو مشغول، والتركيز بيرجع لمصدره.
 * الحالات: عادي، خطأ (error)، مشغول (busy)، خطر (danger).
 */
export function Dialog(p: {
  title: string
  body?: ReactNode
  children?: ReactNode
  okLabel: string
  cancelLabel?: string
  busyLabel?: string
  danger?: boolean
  busy?: boolean
  error?: string
  onOk: () => void
  onCancel: () => void
  /** وين يرجع التركيز بعد السكر، إذا المصدر انطفى (زر صار معطل وهو مشغول). */
  returnTo?: React.RefObject<HTMLElement | null>
  /** زر ثالث غير الإلغاء. Esc ما بيضغطه. */
  secondary?: { label: string; onClick: () => void }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const errId = useId()
  const returnTo = useRef(p.returnTo)
  const cancel = useRef(p.onCancel)
  cancel.current = p.onCancel
  const busy = useRef(p.busy)
  busy.current = p.busy

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null
    const from = active && active !== document.body ? active : null
    const back = returnTo.current
    const node = ref.current
    const first = node?.querySelector<HTMLElement>('input, textarea, select, button:not([disabled])')
    first?.focus()
    return () => {
      // بعد ما يتسكر الحوار، الزر ممكن يكون لسا معطل للحظة. بنستنى دورة وبعدين بنرجع التركيز،
      // بس إذا الحوار فعلا راح (StrictMode بيركّبه مرتين بوضع التطوير).
      // setTimeout مش requestAnimationFrame: الأخير بيوقف لما النافذة مخفية.
      setTimeout(() => {
        if (node?.isConnected) return
        ;(back?.current ?? from)?.focus?.()
      }, 0)
    }
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!busy.current) cancel.current()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll<HTMLElement>('input, textarea, select, button:not([disabled]), [tabindex="0"]')]
    if (!items.length) return
    const first = items[0]!
    const last = items[items.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="ov" onKeyDown={onKey} onMouseDown={(e) => e.target === e.currentTarget && !p.busy && p.onCancel()}>
      <div ref={ref} className="dlg" role={p.danger ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={titleId} aria-busy={p.busy || undefined}>
        <h2 id={titleId} className="h2">{p.title}</h2>
        {p.body && <div>{p.body}</div>}
        <form
          className="dlg-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!p.busy) p.onOk()
          }}
          aria-describedby={p.error ? errId : undefined}
        >
          {p.children}
          {p.error && <span id={errId} className="emsg" role="alert">{p.error}</span>}
          <div className="dlg-actions">
            {p.cancelLabel !== '' && (
              <button type="button" className="btn btn-g" disabled={p.busy} onClick={p.onCancel}>{p.cancelLabel ?? 'ألغِ'}</button>
            )}
            {p.secondary && (
              <button type="button" className="btn btn-s" disabled={p.busy} onClick={p.secondary.onClick}>{p.secondary.label}</button>
            )}
            <button type="submit" className={p.danger ? 'btn btn-d' : 'btn btn-p'} disabled={p.busy}>
              {p.busy && <span className="spin" aria-hidden="true" />}
              {p.busy ? (p.busyLabel ?? 'جاري الحفظ') : p.okLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
