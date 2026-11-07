import messages from './messages.ar.json'

export type MessageKey = keyof typeof messages

/** بيرجع الرسالة مع تعويض المتغيرات {name}. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** بيفصل أول جملة عن الباقي، للعنوان العريض في شريط الحالة. */
export function splitFirstSentence(text: string): [string, string] {
  const i = text.indexOf('. ')
  return i === -1 ? [text, ''] : [text.slice(0, i + 1), text.slice(i + 2)]
}
