// إعدادات التطوير والفحص من متغيرات البيئة. مقفولة إلا لو الكود فتحها صراحة،
// والبرنامج المبني ما بيفتحها. وإلا NUQTA_MACHINE_ID بيخلي سيريال جهاز يشتغل على جهاز ثاني،
// وNUQTA_INSTALLED_AT بيطوّل التجربة، وELECTRON_RENDERER_URL بيحمّل صفحة غريبة بصلاحيات البرنامج.

export type DevVar =
  | 'NUQTA_DB'
  | 'NUQTA_MOCK'
  | 'NUQTA_NO_SEED'
  | 'NUQTA_PRINT_PDF_DIR'
  | 'NUQTA_BACKUP_DIR'
  | 'NUQTA_IMPORT_FILE'
  | 'NUQTA_MACHINE_ID'
  | 'NUQTA_INSTALLED_AT'
  | 'ELECTRON_RENDERER_URL'

let open = false

/** index.ts بينادي هالدالة بس لما البرنامج مش مبني. */
export function allowDevEnv(): void {
  open = true
}

/** للفحص. */
export function lockDevEnv(): void {
  open = false
}

export function devEnv(name: DevVar): string | undefined {
  return open ? process.env[name] : undefined
}
