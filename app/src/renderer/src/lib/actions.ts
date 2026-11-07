import { useRef } from 'react'
import type { ActionError } from '@shared/api'
import { cardsText } from './format'
import { t } from './i18n'

/**
 * مفتاح العملية: ثابت لنفس المحاولة (الضغط المزدوج أو إعادة الطلب)، وبيتجدد بعد ما تنجح.
 * هيك الطلب المكرر بيوصل بنفس المفتاح، وقاعدة البيانات بتسجله مرة وحدة.
 */
export function useOpKey(): { key: () => string; renew: () => void } {
  const k = useRef<string>(crypto.randomUUID())
  return { key: () => k.current, renew: () => { k.current = crypto.randomUUID() } }
}

/** رسالة الخطأ اللي بتنعرض للمستخدم. */
export function errorText(e: ActionError): string {
  switch (e.code) {
    case 'amount_invalid': return t('err.amount')
    case 'count_invalid': return t('err.count')
    case 'return_over': return t('err.returnOver', { n: e.held ?? 0 })
    case 'not_held': return `${cardsText(e.codes?.length ?? 0)} مش عنده: ${(e.codes ?? []).slice(0, 5).join('، ')}${(e.codes?.length ?? 0) > 5 ? '…' : ''}`
    case 'name_required': return t('err.distName')
    case 'already_corrected': return 'هاي التسوية انصححت قبل.'
    case 'dispute_already_open': return 'في خلاف مفتوح أصلا.'
    case 'no_open_dispute': return 'ما في خلاف مفتوح.'
    case 'not_found': return 'ما لقيناه. يمكن انحذف من جهاز ثاني.'
    case 'nothing_to_print': return 'ما في كروت مؤكدة للطباعة.'
    case 'license_required': return 'انتهت التجربة. فعّل البرنامج من الإعدادات عشان تولّد كروت جديدة.'
    case 'print_cancelled': return 'الطباعة ما تمت، وما تغير شي. لما تجرب، بتنطبع نفس الأكواد.'
    case 'print_failed': return 'الطباعة فشلت، وما تغير شي. لما تجرب، بتنطبع نفس الأكواد.'
    case 'category_name': return t('err.catName')
    case 'category_whole': return t('err.catWhole')
    case 'category_profile': return 'اختار ملف الفئة على الراوتر.'
    case 'network_name': return 'اكتب اسم الشبكة.'
    default: return 'صار خطأ، جرّب مرة ثانية.'
  }
}

/** خطأ ربط الراوتر. */
export function connectError(code: string): string {
  switch (code) {
    case 'router_ip': return t('err.routerIp')
    case 'router_creds': return t('err.routerCreds')
    case 'router_unreachable': return t('err.routerDown')
    case 'router_auth': return 'اسم المستخدم أو كلمة المرور غلط.'
    case 'router_tls_mismatch': return 'شهادة الراوتر تغيرت عن المحفوظة. تأكد إنه نفس الراوتر قبل ما تكمل.'
    case 'secret_unavailable': return 'ما قدرنا نحفظ كلمة المرور بأمان على هالجهاز.'
    default: return 'الراوتر رفض الاتصال. تأكد من الإعدادات وجرّب مرة ثانية.'
  }
}
