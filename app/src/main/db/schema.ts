// مخطط قاعدة البيانات (HANDOFF القسم 9). كل ترحيل بينفذ مرة وحدة بالترتيب، ورقمه في PRAGMA user_version.
// ما بنعدل ترحيل انشحن. التغيير الجديد بيصير ترحيل جديد بآخر القائمة.

import { BATCH_TRANSITIONS, CARD_TRANSITIONS, PRINTABLE } from '@shared/cards'

const ENTRY_TYPES = ['opening', 'delivery', 'usage', 'settlement', 'return', 'correction', 'dispute_open', 'dispute_close']

const list = (xs: readonly string[]): string => xs.map((x) => `'${x}'`).join(', ')

/** المال والعدد integer بس. SQLite بيقبل أي نوع بالعمود إذا ما في CHECK. */
const int = (col: string, extra = ''): string => `${col} INTEGER NOT NULL CHECK (typeof(${col}) = 'integer'${extra ? ' AND ' + extra : ''})`

/** شرط SQL بيقول إن الانتقال من OLD.status لـNEW.status مسموح، من نفس جدول الواجهة. */
function allowedMove(table: Readonly<Record<string, readonly string[]>>): string {
  const pairs = Object.entries(table).flatMap(([from, tos]) => tos.map((to) => `(OLD.status = '${from}' AND NEW.status = '${to}')`))
  return `OLD.status = NEW.status OR ${pairs.join(' OR ')}`
}

const v1 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'cashier')),
  note TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TABLE routers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  ${int('port', 'port BETWEEN 1 AND 65535')} DEFAULT 8729,
  -- مرجع لكلمة المرور في مخزن النظام المشفر. كلمة المرور نفسها ما بتنحفظ هون.
  secret_ref TEXT,
  last_seen_at TEXT
) STRICT;

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  router_profile TEXT NOT NULL,
  limit_uptime TEXT,
  ${int('whole_ag', 'whole_ag >= 0')},
  ${int('sale_ag', 'sale_ag >= 0')},
  archived_at TEXT
) STRICT;

CREATE TABLE distributors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  area TEXT NOT NULL DEFAULT '',
  ${int('credit_limit_ag', 'credit_limit_ag >= 0')},
  -- متى بينشأ الدين. سياسة لكل موزع (HANDOFF القسم 5، القاعدة 3).
  debt_policy TEXT NOT NULL DEFAULT 'on_use' CHECK (debt_policy IN ('on_use', 'on_delivery')),
  opened_at TEXT NOT NULL
) STRICT;

CREATE TABLE batches (
  id INTEGER PRIMARY KEY,
  ${int('no', 'no > 0')} UNIQUE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  router_id INTEGER NOT NULL REFERENCES routers(id),
  -- NULL يعني بيع مباشر: بدون عهدة وبدون دين.
  distributor_id INTEGER REFERENCES distributors(id),
  ${int('count', 'count > 0')},
  -- السعر بينثبت لحظة التوليد (القاعدة 7). trigger تحت بيمنع تغييره.
  ${int('whole_ag', 'whole_ag >= 0')},
  ${int('sale_ag', 'sale_ag >= 0')},
  status TEXT NOT NULL DEFAULT 'form' CHECK (status IN (${list(Object.keys(BATCH_TRANSITIONS))})),
  op_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE cards (
  code TEXT PRIMARY KEY CHECK (code GLOB '[A-Z2-9][A-Z2-9][A-Z2-9][A-Z2-9]-[A-Z2-9][A-Z2-9][A-Z2-9][A-Z2-9]'),
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN (${list(Object.keys(CARD_TRANSITIONS))})),
  confirmed_at TEXT,
  ${int('printed_times', 'printed_times >= 0')} DEFAULT 0,
  delivered_at TEXT,
  first_used_at TEXT,
  returned_at TEXT
) STRICT;
CREATE INDEX cards_batch ON cards(batch_id, status);

CREATE TABLE ledger (
  id INTEGER PRIMARY KEY,
  distributor_id INTEGER NOT NULL REFERENCES distributors(id),
  type TEXT NOT NULL CHECK (type IN (${list(ENTRY_TYPES)})),
  ${int('cards_delta')},
  ${int('charge_ag')},
  ${int('paid_ag')},
  ref_ledger_id INTEGER REFERENCES ledger(id),
  batch_id INTEGER REFERENCES batches(id),
  policy TEXT CHECK (policy IS NULL OR policy IN ('on_use', 'on_delivery')),
  note TEXT NOT NULL DEFAULT '',
  -- نفس المفتاح مرتين يعني نفس الطلب (القاعدة 9).
  op_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  CHECK (type <> 'correction' OR ref_ledger_id IS NOT NULL)
) STRICT;
CREATE INDEX ledger_dist ON ledger(distributor_id, id);
-- الحركة ما بتتصحح مرتين.
CREATE UNIQUE INDEX ledger_one_correction ON ledger(ref_ledger_id) WHERE type = 'correction';

-- الدفتر إضافة بس (القاعدة 1، ثابت).
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

CREATE TRIGGER batch_price_frozen BEFORE UPDATE OF whole_ag, sale_ag, count, category_id, distributor_id, no ON batches
WHEN OLD.whole_ag IS NOT NEW.whole_ag OR OLD.sale_ag IS NOT NEW.sale_ag OR OLD.count IS NOT NEW.count
  OR OLD.category_id IS NOT NEW.category_id OR OLD.distributor_id IS NOT NEW.distributor_id OR OLD.no IS NOT NEW.no
BEGIN SELECT RAISE(ABORT, 'batch is frozen after generation'); END;

CREATE TRIGGER batch_status_flow BEFORE UPDATE OF status ON batches
WHEN NOT (${allowedMove(BATCH_TRANSITIONS)})
BEGIN SELECT RAISE(ABORT, 'batch status move not allowed'); END;

CREATE TRIGGER card_status_flow BEFORE UPDATE OF status ON cards
WHEN NOT (${allowedMove(CARD_TRANSITIONS)})
BEGIN SELECT RAISE(ABORT, 'card status move not allowed'); END;

-- الطباعة ممنوعة قبل التأكيد.
CREATE TRIGGER card_print_after_confirm BEFORE UPDATE OF printed_times ON cards
WHEN NEW.printed_times > OLD.printed_times AND NEW.status NOT IN (${list([...PRINTABLE])})
BEGIN SELECT RAISE(ABORT, 'card cannot be printed before it is confirmed'); END;

CREATE TRIGGER card_code_fixed BEFORE UPDATE OF code, batch_id ON cards
BEGIN SELECT RAISE(ABORT, 'card code is fixed'); END;

CREATE TABLE print_log (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  ${int('cards', 'cards > 0')},
  template TEXT NOT NULL,
  at TEXT NOT NULL,
  by TEXT NOT NULL
) STRICT;

-- طابور الراوتر والنسخ السحابي: الشغل اللي بيستنى رجوع الراوتر أو النت.
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  ${int('attempts', 'attempts >= 0')} DEFAULT 0,
  op_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  done_at TEXT
) STRICT;
CREATE INDEX outbox_pending ON outbox(status, id);
`

// الكشف بيعرض أي كروت انحسبت بكل حركة استخدام، ومن أي جهاز (إثبات للموزع).
const v2 = `
ALTER TABLE cards ADD COLUMN usage_ledger_id INTEGER REFERENCES ledger(id);
ALTER TABLE cards ADD COLUMN first_mac TEXT;
CREATE INDEX cards_usage ON cards(usage_ledger_id);
`

// أدوار النموذج: المدير (صاحب الشبكة) والفني. جدول المستخدمين كان فاضي، فبنعيد إنشاءه بالأدوار الصح.
const v3 = `
DROP TABLE users;
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  role TEXT NOT NULL CHECK (role IN ('owner', 'technician')),
  created_at TEXT NOT NULL
) STRICT;
`

// كروت مستوردة من برامج ثانية: أكوادها مش بصيغتنا (أرقام، أحرف صغيرة، أطوال ثانية).
// الكود صار أي أحرف وأرقام وشرطة بطول 4 لـ32، والمقارنة بدون حالة الأحرف عشان البحث يلاقيها.
// SQLite ما بيغير CHECK على جدول موجود، فبنعيد بناء الجدول بنفس البيانات والقيود.
const v4 = `
CREATE TABLE cards_new (
  code TEXT PRIMARY KEY COLLATE NOCASE CHECK (length(code) BETWEEN 4 AND 32 AND code NOT GLOB '*[^A-Za-z0-9-]*'),
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN (${list(Object.keys(CARD_TRANSITIONS))})),
  confirmed_at TEXT,
  ${int('printed_times', 'printed_times >= 0')} DEFAULT 0,
  delivered_at TEXT,
  first_used_at TEXT,
  returned_at TEXT,
  usage_ledger_id INTEGER REFERENCES ledger(id),
  first_mac TEXT
) STRICT;
INSERT INTO cards_new (code, batch_id, status, confirmed_at, printed_times, delivered_at, first_used_at, returned_at, usage_ledger_id, first_mac)
  SELECT code, batch_id, status, confirmed_at, printed_times, delivered_at, first_used_at, returned_at, usage_ledger_id, first_mac FROM cards;
DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;
CREATE INDEX cards_batch ON cards(batch_id, status);
CREATE INDEX cards_usage ON cards(usage_ledger_id);

CREATE TRIGGER card_status_flow BEFORE UPDATE OF status ON cards
WHEN NOT (${allowedMove(CARD_TRANSITIONS)})
BEGIN SELECT RAISE(ABORT, 'card status move not allowed'); END;

CREATE TRIGGER card_print_after_confirm BEFORE UPDATE OF printed_times ON cards
WHEN NEW.printed_times > OLD.printed_times AND NEW.status NOT IN (${list([...PRINTABLE])})
BEGIN SELECT RAISE(ABORT, 'card cannot be printed before it is confirmed'); END;

CREATE TRIGGER card_code_fixed BEFORE UPDATE OF code, batch_id ON cards
BEGIN SELECT RAISE(ABORT, 'card code is fixed'); END;
`

// الدخول برمز لكل مستخدم. الرمز نفسه ما بينحفظ: hash بـscrypt. والمستخدم الموقوف ما بيدخل.
const v5 = `
ALTER TABLE users ADD COLUMN pin_hash TEXT;
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
`

// عدّاد المحاولات الغلط بيضل بعد إعادة التشغيل، عشان التسكير والفتح ما يصفّره.
const v6 = `
ALTER TABLE users ADD COLUMN pin_fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN pin_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN pin_locked_until INTEGER NOT NULL DEFAULT 0;
`

// ربط الفئات والدفعات بسيرفر هوتسبوت محدد (مثلا hotspot-wifi أو hotspot-lan). null للجميع.
const v7 = `
ALTER TABLE categories ADD COLUMN hotspot_server TEXT;
ALTER TABLE batches ADD COLUMN hotspot_server TEXT;
`

export const MIGRATIONS: readonly string[] = [v1, v2, v3, v4, v5, v6, v7]
