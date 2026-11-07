import { api } from '@/lib/api'
import type { StateMode } from '@/lib/screens'
import { netUp, routerUp, useStore } from '@/lib/store'

/** تحكم للمطور بس: قطع الراوتر الوهمي والنت، وحالات الشاشة. ما بيظهر بالنسخة المبنية. */
export function DevBar() {
  const { state, dispatch } = useStore()
  const router = routerUp(state)
  const net = netUp(state)
  return (
    <section className="devbar" aria-label="تحكم المطور">
      <div><strong>وضع التطوير</strong><span className="sub">{state.status?.router.mock ? 'راوتر وهمي' : 'راوتر حقيقي'}</span></div>
      <div>
        <button type="button" className="btn btn-s sm" onClick={() => dispatch({ type: 'forceNetDown', down: net })}>
          {net ? 'اقطع النت' : 'رجّع النت'}
        </button>
        <button type="button" className="btn btn-s sm" disabled={!state.status?.router.mock}
          onClick={async () => {
            await api.devSetRouter(!router)
            dispatch({ type: 'status', status: await api.status() })
          }}>
          {router ? 'اقطع الراوتر' : 'رجّع الراوتر'}
        </button>
        <label htmlFor="dev-sm" className="lbl">حالة الشاشة</label>
        <select id="dev-sm" className="demo-sel" value={state.stateMode}
          onChange={(e) => dispatch({ type: 'setStateMode', mode: e.target.value as StateMode })}>
          <option value="normal">عادية</option>
          <option value="loading">تحميل</option>
          <option value="error">خطأ</option>
          <option value="empty">فاضية</option>
        </select>
      </div>
    </section>
  )
}
