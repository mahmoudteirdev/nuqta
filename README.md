<!-- 1. الهيدر -->
<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0A5C56,100:13201D&height=220&section=header&text=%D9%86%D9%8F%D9%82%D8%B7%D8%A9&fontSize=80&fontColor=F4F5F0&fontAlignY=36&animation=fadeIn&desc=%D8%AF%D9%81%D8%AA%D8%B1%20%D8%AD%D8%B3%D8%A7%D8%A8%D8%A7%D8%AA%20%D9%84%D8%B4%D8%A8%D9%83%D8%A7%D8%AA%20%D8%A7%D9%84%D9%87%D9%88%D8%AA%D8%B3%D8%A8%D9%88%D8%AA&descSize=20&descAlignY=58" alt="نُقطة: دفتر حسابات لشبكات الهوتسبوت على MikroTik" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-45-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron 45" />
  <img src="https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/SQLite-local-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite local" />
  <br />
  <img src="https://img.shields.io/badge/tests-276%20passing-0A5C56?style=for-the-badge&logo=vitest&logoColor=white" alt="276 tests passing" />
  <img src="https://img.shields.io/badge/offline-first-13201D?style=for-the-badge" alt="Offline first" />
  <img src="https://img.shields.io/badge/RTL-%D8%B9%D8%B1%D8%A8%D9%8A-F26B21?style=for-the-badge" alt="RTL Arabic" />
  <img src="https://img.shields.io/badge/Windows-desktop-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows desktop" />
</p>

<p align="center">
  <img src="docs/screenshots/home.png" alt="شاشة شغل اليوم: المستحق على الموزعين، ومهام التحصيل والمخزون بترتيب الأولوية" width="88%" />
</p>

<div dir="rtl">

## 👋 أهلا

**نُقطة** دفتر حسابات لأصحاب شبكات الهوتسبوت على MikroTik، اللي بيبيعوا كروت الإنترنت عبر موزعين. بيولّد الكروت وبيبعتها للراوتر، وبيطبعها، وبيتابع مين معه كم كرت وكم عليه، من غير ما يحتاج نت.

</div>

<!-- 2. عن المشروع -->
<div dir="rtl">

## 👨‍💻 عن المشروع

</div>

```yaml
project:   Nuqta (نُقطة)
for:       MikroTik hotspot owners who sell vouchers through distributors
does:
  - generate voucher codes, send them to the router, confirm, print, deliver
  - keep an append-only ledger per distributor, in integer agorot (no floats)
  - read card usage from the router and turn it into debt, once per card
  - settle, return cards, open disputes, correct with linked reverse entries
  - reports: collected vs used, per-batch commission, stale cards
works:     fully offline; the router is on the local network
language:  Arabic, right to left
platform:  Windows desktop (Electron)
status:    first version built, 7/10 acceptance items automated and passing
```

<!-- 3. الأدوات والتقنيات -->
<div dir="rtl">

## 🧰 الأدوات والتقنيات

</div>

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/electron/electron-original.svg" alt="Electron" width="52" height="52" />&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" alt="React" width="52" height="52" />&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" alt="TypeScript" width="52" height="52" />&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vitejs/vitejs-original.svg" alt="Vite" width="52" height="52" />&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/sqlite/sqlite-original.svg" alt="SQLite" width="52" height="52" />&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" alt="Node.js" width="52" height="52" />&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/windows8/windows8-original.svg" alt="Windows" width="52" height="52" />
</p>

<div dir="rtl">

| الطبقة | الأداة | ليش |
|---|---|---|
| البرنامج | Electron 45 + React 19 + TypeScript | برنامج سطح مكتب بالعربي وRTL، بنافذة معزولة وبدون وصول للنظام من الواجهة |
| قاعدة البيانات | SQLite عبر `node:sqlite` المدمجة | بدون مكتبة native، والدفتر محمي بـtriggers ما بتسمح بتعديل ولا حذف |
| الراوتر | RouterOS API عبر api-ssl | مكتوب من الصفر، مع تثبيت بصمة الشهادة، وراوتر وهمي للتطوير |
| الطباعة | نافذة طباعة مخفية من نفس البناء | A4 بـ12 و24 كرت، وحرارية 80mm، وكشف الحساب، وتقارير PDF |
| الترخيص | Ed25519 | كود جهاز ومفتاح موقّع بيشتغل بدون نت |
| الاختبار | Vitest | 276 اختبار، منهم اختبارات القبول |
| الخطوط | IBM Plex Sans Arabic وIBM Plex Mono | محلية، عشان البرنامج يشتغل بدون نت |

</div>

<!-- 4. حالة المشروع -->
<div dir="rtl">

## 📈 حالة المشروع

### الشاشات

</div>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/account.png" alt="حساب الموزع وكشفه: كروت عنده، قيمة المستخدم، المحصّل، والمستحق، مع التسوية والكشف" /></td>
    <td width="50%"><img src="docs/screenshots/card.png" alt="فحص كرت: سبب عدم اشتغاله، والوقت الباقي، وسجله" /></td>
  </tr>
  <tr>
    <td align="center" dir="rtl"><b>الموزع وكشف حسابه</b></td>
    <td align="center" dir="rtl"><b>فحص كرت</b></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/network.png" alt="الشبكة: حالة الراوتر والطابور والمتصلين الآن مع فصل الجلسة" /></td>
    <td width="50%"><img src="docs/screenshots/reports.png" alt="التقارير: المحصّل مقابل المستخدم لكل موزع" /></td>
  </tr>
  <tr>
    <td align="center" dir="rtl"><b>الشبكة والمتصلين</b></td>
    <td align="center" dir="rtl"><b>التقارير</b></td>
  </tr>
</table>

<div dir="rtl">

### اختبارات القبول

من ملف التسليم ([HANDOFF.md](HANDOFF.md)، القسم 12). التفاصيل والأدلة بـ[app/ACCEPTANCE.md](app/ACCEPTANCE.md).

| | البند | الحالة |
|---|---|---|
| 1 | 1,000 حركة عشوائية: المستحق = مجموع الدفتر، بدون float | ✅ |
| 2 | تغيير سعر فئة ما بيغير أي مبلغ قديم | ✅ |
| 3 | ما في طريقة تعدل حركة بالدفتر | ✅ |
| 4 | قطع الراوتر وسط إرسال دفعة: ما في كرت بينطبع قبل تأكيده، وما في كود بيضيع | ✅ |
| 5 | يوم كامل بدون اتصال، ثم مزامنة بدون تكرار | ✅ للراوتر |
| 6 | «سجّل التسوية» مرتين بسرعة بتسجل مرة | ✅ |
| 7 | `num()` و`normCode()` نفس نتيجة النموذج | ✅ |
| 8 | الطباعة العربية على A4 وحرارية 80mm | 🟡 PDF سليم، والطابعة الحقيقية لسا |
| 9 | إمكانية الوصول على النسخة المبنية | 🟡 الفحص الآلي نظيف، وNVDA واللمس بدهم إنسان |
| 10 | مقاييس أول دفعة والتسوية | ⬜ بده جلسات مع مستخدمين |

### شغّله

</div>

```bash
cd app
npm install
npm run dev        # البرنامج بوضع التطوير، مع بيانات تجربة وراوتر وهمي
npm test           # كل الاختبارات
npm run build      # بناء البرنامج
```

<div dir="rtl">

متغيرات للتطوير والفحص بس:

| المتغير | شو بيعمل |
|---|---|
| `NUQTA_DB` | قاعدة بيانات بمسار ثاني |
| `NUQTA_MOCK=1` | الراوتر الوهمي حتى لو في راوتر حقيقي محفوظ |
| `NUQTA_NO_SEED=1` | بدون بيانات تجربة، عشان تشوف أول تشغيل |
| `NUQTA_PRINT_PDF_DIR` | كل الطباعة بتصير ملفات PDF بهالمجلد |
| `NUQTA_BACKUP_DIR` | مجلد نسخ ثاني |

### هيكل المشروع

</div>

```text
HANDOFF.md            ملف التسليم: مصدر السلوك والقرارات
reference/            النموذج التفاعلي
screens/ tokens/ ...  صور الشاشات والألوان والمكونات من التصميم
app/
  src/shared/         الحساب والدفتر والأكواد: كود صافي ومختبر
  src/main/           قاعدة البيانات، الراوتر، الطباعة، النسخ، الترخيص
  src/renderer/       الواجهة وصفحة الطباعة
  scripts/license.mjs أداة إصدار مفاتيح الترخيص
  ACCEPTANCE.md       نتيجة اختبارات القبول
```

<div dir="rtl">

### الترخيص

البرنامج بيتفعل بكود الجهاز ومفتاح موقّع، وبدون نت. كل سيريال مربوط بجهاز واحد. أداة الإصدار لصاحب البرنامج بس، وما بتنشحن مع البرنامج:

</div>

```bash
cd app
npm run license:admin
```

<div dir="rtl">

بتفتح صفحة محلية بالمتصفح: بتكتب اسم الزبون وكود جهازه والمدة، وبتطلع السيريال وبتسجله بقائمة الزباين. من القائمة بتنسخ سيريال قديم، أو بتجدد، أو بتصدّر لـExcel. الصفحة شغالة على جهازك بس، وبدها الرابط اللي بتطبعه الأداة.

مفتاح الإصدار وسجل الزباين (`licenses.jsonl`) بالمجلد `~/.nuqta-vendor`، برا المشروع. وسطر الأوامر لسا موجود لمين بدو إياه:

</div>

```bash
node scripts/license.mjs issue --key <license-private.pem> --device NQ-XXXX-XXXX --until 2027-12-31
```

<div dir="rtl">

> [!IMPORTANT]
> المفتاح الخاص اللي بيصدر التراخيص **ما بيكون بالمستودع أبدا**، و`*.pem` مستثنى بـ`.gitignore`. انسخ المجلد احتياط بمكان آمن: بدون المفتاح ما بتقدر تصدر سيريالات للبرنامج المنشور.

> [!NOTE]
> ما في سيرفر، فسيريال انصدر ما بينوقف. الأفضل تصدر لمدة محددة وتجدد.

### نسيان رمز المدير

صاحب الشبكة بيضغط «نسيت الرمز؟» بشاشة الدخول، وبيبعتلك كود الجهاز ورمز الطلب. بتصدرله مفتاح استرجاع من أداة الإصدار، تحت «زبون نسي رمز المدير». المفتاح لهالطلب بس، بيشتغل مرة وحدة، وصالح 3 أيام. **تأكد إنه صاحب الشبكة فعلا قبل ما تبعته.**

### لسا قبل الإطلاق

- تجربة على راوتر MikroTik حقيقي: الاتصال، وتحديد أول استخدام من `uptime`، وإضافة ألف كرت دفعة وحدة.
- تجربة على طابعة A4 وطابعة حرارية 80mm.
- فحص بإنسان: NVDA بصوت عربي، وشاشة لمس.
- قرارات مفتوحة: طريقة الدفع، والنسخ السحابي، والعملة. القائمة كاملة بآخر [ACCEPTANCE.md](app/ACCEPTANCE.md).

</div>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:13201D,100:0A5C56&height=110&section=footer" alt="" width="100%" />
</p>
