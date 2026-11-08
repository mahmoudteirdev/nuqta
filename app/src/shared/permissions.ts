// مين بيقدر ينادي شو. نفس الجدول بالعملية الرئيسية (اللي بتمنع فعليا) وبالواجهة (اللي بتخبي).
// Record على كل دوال Backend: دالة جديدة بدون صلاحية ما بتنبني (خطأ بالأنواع).

import type { Backend, UserRole } from './api'

export type Permission =
  /** بدون دخول: حالة البرنامج، الدخول، صفحة الطباعة. */
  | 'public'
  /** أي مستخدم داخل، مدير أو فني. */
  | 'any'
  /** المدير بس. */
  | 'owner'
  /** أول تشغيل قبل ما يكون في مستخدمين، أو المدير. */
  | 'setup'
  /** قاعدة بيانات تالفة (ما في مستخدمين نقدر نقرأهم)، أو المدير. */
  | 'recovery'
  /** وضع التطوير بس. */
  | 'dev'

export const PERMISSIONS: Record<keyof Backend, Permission> = {
  status: 'public',
  login: 'public',
  createOwnerPin: 'public',
  pinResetRequest: 'public',
  pinResetApply: 'public',
  printJob: 'public',
  printReady: 'public',
  logout: 'any',
  devSetRouter: 'dev',

  // الكروت والشبكة: شغل الفني.
  home: 'any',
  batchForm: 'any',
  batchView: 'any',
  createBatch: 'any',
  resendBatch: 'any',
  printBatch: 'any',
  deliverBatch: 'any',
  batchLog: 'any',
  reprintBatch: 'any',
  categories: 'any',
  routerProfiles: 'any',
  templateSettings: 'any',
  checkCard: 'any',
  kickSession: 'any',
  network: 'any',

  // الحسابات والمال.
  account: 'owner',
  usageCards: 'owner',
  settle: 'owner',
  correctSettlement: 'owner',
  returnCards: 'owner',
  openDispute: 'owner',
  closeDispute: 'owner',
  setCreditLimit: 'owner',
  reports: 'owner',
  exportReport: 'owner',
  exportReportPdf: 'owner',
  printStatement: 'owner',
  setCategoryPrices: 'owner',
  addCategory: 'owner',
  updateCategory: 'owner',
  deleteCategory: 'owner',

  // الإعدادات.
  saveTemplateSettings: 'owner',
  networkSettings: 'owner',
  saveNetworkSettings: 'owner',
  users: 'owner',
  addUser: 'owner',
  setUserPin: 'owner',
  setUserActive: 'owner',
  setLockAfter: 'owner',
  rules: 'owner',
  saveRules: 'owner',
  license: 'owner',
  activateLicense: 'owner',
  checkForUpdate: 'owner',
  installUpdate: 'owner',
  importPreview: 'owner',
  importCommit: 'owner',
  backupNow: 'owner',
  saveBackupAs: 'owner',

  // أول تشغيل.
  connectRouter: 'setup',
  setupCategories: 'setup',
  saveSetupCategories: 'setup',
  setSetupStep: 'setup',
  setupDistributors: 'setup',
  setupTestCard: 'setup',
  finishSetup: 'setup',
  addDistributor: 'setup',

  // الاسترجاع لازم يشتغل حتى لو قاعدة البيانات تالفة وما في مين يدخل.
  backups: 'recovery',
  restoreBackup: 'recovery',
  restoreFromFile: 'recovery'
}

export interface AccessContext {
  role: UserRole | null
  /** أول تشغيل لسا ما خلص، وما في مستخدمين برموز. */
  setupOpen: boolean
  /** قاعدة البيانات ما فتحت. */
  dbBroken: boolean
  dev: boolean
}

export function allowed(method: keyof Backend, c: AccessContext): boolean {
  const p = PERMISSIONS[method]
  switch (p) {
    case 'public': return true
    case 'dev': return c.dev
    case 'any': return c.role !== null
    case 'owner': return c.role === 'owner'
    case 'setup': return c.setupOpen || c.role === 'owner'
    case 'recovery': return c.dbBroken || c.role === 'owner'
  }
}

/** الشاشات حسب الدور، للقائمة. */
export const OWNER_SCREENS: ReadonlySet<string> = new Set(['account', 'reports', 'settings'])
