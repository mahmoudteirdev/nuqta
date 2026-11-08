import { useRef } from 'react'
import type { ActionError } from '@shared/api'
import { cardsText } from './format'
import { getLang, t } from './i18n'

/**
 * مفتاح العملية: ثابت لنفس المحاولة (الضغط المزدوج أو إعادة الطلب)، وبيتجدد بعد ما تنجح.
 * هيك الطلب المكرر بيوصل بنفس المفتاح، وقاعدة البيانات بتسجله مرة وحدة.
 */
export function useOpKey(): { key: () => string; renew: () => void } {
  const k = useRef<string>(crypto.randomUUID())
  return { key: () => k.current, renew: () => { k.current = crypto.randomUUID() } }
}

/** رسالة الخطأ اللي بتنعرض للمستخدم بحسب اللغة. */
export function errorText(e: ActionError, lang = getLang()): string {
  const isEn = lang === 'en'
  switch (e.code) {
    case 'amount_invalid': return t('err.amount')
    case 'count_invalid': return t('err.count')
    case 'return_over': return t('err.returnOver', { n: e.held ?? 0 })
    case 'not_held':
      return isEn
        ? `${cardsText(e.codes?.length ?? 0, 'en')} not held: ${(e.codes ?? []).slice(0, 5).join(', ')}${(e.codes?.length ?? 0) > 5 ? '…' : ''}`
        : `${cardsText(e.codes?.length ?? 0, 'ar')} مش عنده: ${(e.codes ?? []).slice(0, 5).join('، ')}${(e.codes?.length ?? 0) > 5 ? '…' : ''}`
    case 'name_required': return t('err.distName')
    case 'already_corrected': return isEn ? 'This settlement was already corrected.' : 'هاي التسوية انصححت قبل.'
    case 'dispute_already_open': return isEn ? 'A dispute is already open.' : 'في خلاف مفتوح أصلا.'
    case 'no_open_dispute': return isEn ? 'No dispute is currently open.' : 'ما في خلاف مفتوح.'
    case 'not_found': return isEn ? 'Not found. It may have been deleted from another device.' : 'ما لقيناه. يمكن انحذف من جهاز ثاني.'
    case 'nothing_to_print': return isEn ? 'No confirmed cards to print.' : 'ما في كروت مؤكدة للطباعة.'
    case 'owner_required': return isEn ? 'This distributor exceeds credit limit. Owner approval required.' : 'هذا الموزع فوق سقف الدين. صاحب الشبكة لازم يقرر إذا بيسلّمه.'
    case 'license_required': return isEn ? 'Trial expired. Activate software in Settings to generate new cards.' : 'انتهت التجربة. فعّل البرنامج من الإعدادات عشان تولّد كروت جديدة.'
    case 'print_cancelled': return isEn ? 'Printing was cancelled. Unchanged; the same codes can be printed.' : 'الطباعة ما تمت، وما تغير شي. لما تجرب، بتنطبع نفس الأكواد.'
    case 'print_failed': return isEn ? 'Printing failed. Unchanged; the same codes can be printed.' : 'الطباعة فشلت، وما تغير شي. لما تجرب، بتنطبع نفس الأكواد.'
    case 'category_name': return t('err.catName')
    case 'category_whole': return t('err.catWhole')
    case 'category_profile': return isEn ? 'Select or enter profile name on router.' : 'اختار ملف الفئة على الراوتر.'
    case 'network_name': return isEn ? 'Enter network name.' : 'اكتب اسم الشبكة.'
    default: return isEn ? 'An error occurred, please try again.' : 'صار خطأ، جرّب مرة ثانية.'
  }
}

/** خطأ ربط الراوتر بحسب اللغة. */
export function connectError(code: string, lang = getLang()): string {
  const isEn = lang === 'en'
  switch (code) {
    case 'router_ip': return t('err.routerIp')
    case 'router_creds': return t('err.routerCreds')
    case 'router_unreachable': return t('err.routerDown')
    case 'router_auth': return isEn ? 'Incorrect username or password.' : 'اسم المستخدم أو كلمة المرور غلط.'
    case 'router_tls_mismatch': return isEn ? 'Router SSL certificate changed. Ensure it is the same router.' : 'شهادة الراوتر تغيرت عن المحفوظة. تأكد إنه نفس الراوتر قبل ما تكمل.'
    case 'secret_unavailable': return isEn ? 'Could not store password securely on this machine.' : 'ما قدرنا نحفظ كلمة المرور بأمان على هالجهاز.'
    default: return isEn ? 'Router connection rejected. Verify settings and try again.' : 'الراوتر رفض الاتصال. تأكد من الإعدادات وجرّب مرة ثانية.'
  }
}
