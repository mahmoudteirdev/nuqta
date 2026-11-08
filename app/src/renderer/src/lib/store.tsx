import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { AppStatus } from '@shared/api'
import type { ScreenId, StateMode } from './screens'
import { getLang, setLang, type Lang } from './i18n'

export interface AppState {
  lang: Lang
  screen: ScreenId
  stateMode: StateMode
  /** الكود اللي انفحص آخر مرة من البحث. */
  cardCode: string
  /** الموزع المفتوح بشاشة الحساب، أو المختار لدفعة جديدة. */
  distributorId: string | null
  /** الدفعة المفتوحة بشاشة التوليد. */
  batchId: number | null
  /** تبويب الإعدادات اللي لازم يفتح، مثلا الترخيص من تنبيه انتهاء التجربة. */
  settingsTab: string | null
  /** حالة البرنامج من العملية الرئيسية. null لحد أول رد. */
  status: AppStatus | null
  /** النت من المتصفح نفسه. شريط المطور بيقدر يقطعه للتجربة. */
  netUp: boolean
  netDownSince: number | null
  netForcedDown: boolean
  /** بيزيد بعد أي تغيير، عشان الشاشات تعيد القراءة. */
  revision: number
}

export type Action =
  | { type: 'setLang'; lang: Lang }
  | { type: 'go'; screen: ScreenId; distributorId?: string | null; batchId?: number | null; settingsTab?: string | null }
  | { type: 'checkCard'; code: string }
  | { type: 'setStateMode'; mode: StateMode }
  | { type: 'status'; status: AppStatus }
  | { type: 'net'; up: boolean }
  | { type: 'forceNetDown'; down: boolean }
  | { type: 'changed' }

// ضبط اتجاه ولغة الصفحة الأولي دون تثبيت الخيار
if (typeof document !== 'undefined') {
  const l = getLang()
  document.documentElement.lang = l
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'
}

export const initialState: AppState = {
  lang: getLang(),
  screen: 'home',
  stateMode: 'normal',
  cardCode: '',
  distributorId: null,
  batchId: null,
  settingsTab: null,
  status: null,
  netUp: typeof navigator === 'undefined' ? true : navigator.onLine,
  netDownSince: null,
  netForcedDown: false,
  revision: 0
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'setLang': {
      setLang(a.lang)
      return { ...s, lang: a.lang }
    }
    case 'go':
      return {
        ...s, screen: a.screen, stateMode: 'normal',
        distributorId: a.distributorId === undefined ? s.distributorId : a.distributorId,
        batchId: a.batchId === undefined ? s.batchId : a.batchId,
        settingsTab: a.settingsTab ?? null
      }
    case 'checkCard':
      return { ...s, screen: 'card', stateMode: 'normal', cardCode: a.code }
    case 'setStateMode':
      return { ...s, stateMode: a.mode }
    case 'status': {
      const routerChanged = s.status?.router.up !== a.status.router.up
      let nextLang = s.lang
      const userSet = typeof localStorage !== 'undefined' && localStorage.getItem('nuqta_lang_user_set') === 'true'
      if (!userSet && a.status.installerLang) {
        setLang(a.status.installerLang, false)
        nextLang = a.status.installerLang
      }
      return { ...s, status: a.status, lang: nextLang, revision: routerChanged ? s.revision + 1 : s.revision }
    }
    case 'net':
      return { ...s, netUp: a.up, netDownSince: a.up ? null : (s.netDownSince ?? Date.now()) }
    case 'forceNetDown':
      return { ...s, netForcedDown: a.down, netDownSince: a.down ? Date.now() : s.netUp ? null : s.netDownSince }
    case 'changed':
      return { ...s, revision: s.revision + 1 }
  }
}

const Ctx = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return <Ctx value={{ state, dispatch }}>{children}</Ctx>
}

export function useStore(): { state: AppState; dispatch: Dispatch<Action> } {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore outside StoreProvider')
  return c
}

export const routerUp = (s: AppState): boolean => !!s.status?.router.up
export const netUp = (s: AppState): boolean => s.netUp && !s.netForcedDown
