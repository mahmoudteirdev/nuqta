import type { PrintTemplate } from '@shared/api'
import { getLang, type Lang } from '@/lib/i18n'

/** الكرت المطبوع كما بيطلع بالمعاينة. waiting = بالانتظار أو لسا ما تولّد. */
export function Voucher(p: {
  network: string
  category: string
  code: string
  foot: string
  waiting?: boolean
  hint?: boolean
  large?: boolean
  phone?: string
  bgImage?: string | null
  lang?: Lang
}) {
  const isEn = (p.lang ?? getLang()) === 'en'
  const bgStyle = p.bgImage
    ? {
        backgroundImage: `url(${p.bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        position: 'relative' as const
      }
    : undefined

  return (
    <div className={(p.waiting ? 'vc p' : 'vc') + (p.large ? ' vc-lg' : '')} style={bgStyle}>
      <div className="vc-top"><span>{p.network}</span><span>{p.category}</span></div>
      <div className="code" dir="ltr">{p.code}</div>
      {p.hint ? (
        <div className="vc-hint"><span>{isEn ? 'Connect Wi-Fi & enter code' : 'افتح الواي فاي وادخل الكود'}</span>{p.foot && <strong className="m">{p.foot}</strong>}</div>
      ) : (
        <span className="vc-foot">{p.foot}</span>
      )}
      {p.phone && <div className="vc-phone">{p.phone}</div>}
    </div>
  )
}

export const TEMPLATE_INFO: Record<PrintTemplate, { name: string; note: string; page: string }> = {
  'a4-12': { name: 'A4، 12 كرت', note: 'لأي طابعة عادية', page: 'A4، 12 كرت في الصفحة' },
  'a4-24': { name: 'A4، 24 كرت', note: 'كروت أصغر وورق أقل', page: 'A4، 24 كرت في الصفحة' },
  thermal: { name: 'طابعة حرارية', note: 'كرت واحد بكل قصة', page: 'طابعة حرارية، كرت بكل قصة' }
}

export function getTemplateInfo(lang: Lang = getLang()): Record<PrintTemplate, { name: string; note: string; page: string }> {
  if (lang === 'en') {
    return {
      'a4-12': { name: 'A4, 12 cards', note: 'Standard printer', page: 'A4, 12 cards per page' },
      'a4-24': { name: 'A4, 24 cards', note: 'Smaller cards, less paper', page: 'A4, 24 cards per page' },
      thermal: { name: 'Thermal printer', note: 'One card per cut', page: 'Thermal printer, one card per cut' }
    }
  }
  return TEMPLATE_INFO
}
