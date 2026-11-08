import { getEmpty, getErrorTitle, type ScreenId, type StateMode } from '@/lib/screens'
import { useStore } from '@/lib/store'

/** حالات التحميل والخطأ والفاضي، بنص خاص لكل قسم بحسب اللغة. */
export function StateView({ screen, mode, onRetry }: { screen: ScreenId; mode: Exclude<StateMode, 'normal'>; onRetry?: () => void }) {
  const { state, dispatch } = useStore()
  const isEn = state.lang === 'en'

  if (mode === 'loading') {
    const block = (
      <div className="card"><span className="sk" style={{ width: '60%', marginBottom: 14 }} /><span className="sk" style={{ width: '40%', height: 28 }} /></div>
    )
    return (
      <>
        <h1 className="sr">{isEn ? 'Loading' : 'جاري التحميل'}</h1>
        <div className="scr stack" aria-busy="true" role="status" aria-label={isEn ? 'Loading' : 'جاري التحميل'} style={{ gap: 24 }}>
          <span className="sk" style={{ width: 220, height: 30 }} />
          <div className="sk-grid">{block}{block}{block}</div>
          <div className="card">
            <span className="sk" style={{ width: '70%', marginBottom: 16 }} />
            <span className="sk" style={{ width: '90%', marginBottom: 16 }} />
            <span className="sk" style={{ width: '55%' }} />
          </div>
        </div>
      </>
    )
  }

  if (mode === 'error') {
    return (
      <div className="card scr state-err" role="alert">
        <h1>{getErrorTitle(screen, state.lang)}</h1>
        <p>{isEn ? 'Your data is safe. Please retry, or restore the last backup from settings if the issue persists.' : 'بياناتك ما انمسحت. جرّب مرة ثانية، وإذا ضلت المشكلة استرجع آخر نسخة من الإعدادات.'}</p>
        <button type="button" className="btn btn-s" onClick={onRetry ?? (() => dispatch({ type: 'setStateMode', mode: 'normal' }))}>
          {isEn ? 'Retry' : 'أعد المحاولة'}
        </button>
      </div>
    )
  }

  const e = getEmpty(screen, state.lang)
  return (
    <div className="card scr state-empty">
      <h1>{e.title}</h1>
      <p>{e.body}</p>
      <button type="button" className="btn btn-p" onClick={() => dispatch({ type: 'go', screen: e.go })}>{e.cta}</button>
    </div>
  )
}
