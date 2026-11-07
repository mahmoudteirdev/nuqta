import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

const TOAST_MS = 3500

const Ctx = createContext<(text: string) => void>(() => {})

/** رسالة عابرة بتختفي بعد 3.5 ثانية. المنطقة aria-live ثابتة بالصفحة، فقارئ الشاشة بيقرأها. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState('')
  const [seq, setSeq] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const say = useCallback((t: string) => {
    clearTimeout(timer.current)
    setText(t)
    setSeq((n) => n + 1)
    timer.current = setTimeout(() => setText(''), TOAST_MS)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <Ctx.Provider value={say}>
      {children}
      <div aria-live="polite" role="status" className="toast-region">
        {text && <div key={seq} className="toast">{text}</div>}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
