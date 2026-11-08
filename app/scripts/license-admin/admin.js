// صفحة أداة الإصدار. كل نص من الزبون بينكتب بـtextContent، مش HTML.
'use strict'

const TOKEN = new URLSearchParams(location.search).get('t') || ''
const $ = (id) => document.getElementById(id)
const SOON_DAYS = 30

const ERRORS = {
  customer_required: 'اكتب اسم الزبون.',
  device_invalid: 'كود الجهاز مش مزبوط. شكله NQ-XXXX-XXXX، وانسخه من عند الزبون زي ما هو.',
  until_invalid: 'اختار تاريخ الانتهاء.',
  until_past: 'التاريخ لازم يكون اليوم أو بعده.',
  duration_invalid: 'اختار المدة.',
  request_invalid: 'رمز الطلب مش مزبوط. 8 أحرف من شاشة «نسيت الرمز» عند الزبون.',
  no_key: 'ما في مفتاح إصدار.',
  key_exists: 'في مفتاح إصدار موجود، وما بنكتب فوقه.',
  no_public_file: 'ما لقيت ملف المفتاح العام بالبرنامج.',
  forbidden: 'الرابط انتهى. شغّل الأداة من جديد واستخدم الرابط الجديد.'
}
const errorText = (code) => ERRORS[code] || 'صار خطأ، ما انصدر شي. جرّب مرة ثانية.'

let data = null

async function call(path, body) {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Token': TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return r.json()
}

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

const dateAr = (iso) => new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso))
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86_400_000)

function daysWord(n) {
  if (n === 1) return 'يوم'
  if (n === 2) return 'يومين'
  return n <= 10 ? `${n} أيام` : `${n} يوم`
}

/** آخر سيريال لكل جهاز هو اللي بيهم. القديم مكتوب عليه إنه انجدد. */
function status(row, latestId, today) {
  if (row.kind === 'reset') return { cls: 'old', text: 'استرجاع رمز' }
  if (latestId !== row.id) return { cls: 'old', text: 'انجدد' }
  if (!row.expires) return { cls: 'ok', text: 'بدون انتهاء' }
  const left = daysBetween(today, row.expires)
  if (left < 0) return { cls: 'er', text: 'خلص' }
  if (left === 0) return { cls: 'wa', text: 'بيخلص اليوم' }
  if (left <= SOON_DAYS) return { cls: 'wa', text: `باقي ${daysWord(left)}` }
  return { cls: 'ok', text: 'شغال' }
}

function latestByDevice(rows) {
  const out = new Map()
  for (const r of rows) if (r.kind !== 'reset') out.set(r.device, r.id)
  return out
}

function say(text) {
  $('live').textContent = ''
  setTimeout(() => { $('live').textContent = text }, 30)
}

async function copy(text, btn) {
  const was = btn.textContent
  try {
    await navigator.clipboard.writeText(text)
    btn.textContent = 'انتسخ'
    say('انتسخ السيريال.')
  } catch {
    btn.textContent = 'ما انتسخ، حدده يدوي'
    say('ما قدرت أنسخ. حدد السيريال وانسخه يدوي.')
  }
  setTimeout(() => { btn.textContent = was }, 2000)
}

function renderNotice() {
  const box = $('notice')
  box.replaceChildren()
  if (data.keyReady && data.appKey === 'mismatch') {
    const n = el('div', 'bn er')
    const t = el('div')
    t.append(el('strong', '', 'المفتاح بالبرنامج مش مطابق لمفتاح الإصدار. '), 'أي سيريال بتصدره هلأ ما رح ينقبل عند الزبون، إلا لو عدّلت البرنامج وبنيته من جديد.')
    const b = el('button', 'btn btn-s sm', 'عدّل المفتاح بالبرنامج')
    b.type = 'button'
    b.addEventListener('click', () => $('sync-dlg').showModal())
    n.append(t, b)
    box.append(n)
  }
  if (data.keyReady && data.appKey === 'unknown') {
    box.append(el('div', 'bn wa', 'ما قدرت أتأكد إن مفتاح الإصدار مطابق للبرنامج. جرّب أول سيريال على جهاز قبل ما تبيع.'))
  }
  if (data.badLines) {
    box.append(el('div', 'bn wa', `في ${data.badLines} سطر بسجل الزباين مش مقروء، فما بيبين بالقائمة. افتح الملف licenses.jsonl بالمجلد وتأكد منه.`))
  }
  if (data.keyReady) {
    const n = el('div', 'bn wa small')
    const t = el('div')
    const p = el('bdi', 'path', data.dir)
    t.append('انسخ هالمجلد احتياط بمكان آمن: ', p, '. لو ضاع المفتاح الخاص ما بتقدر تصدر سيريالات لهالنسخة. ولو حدا أخده بيقدر يصدر سيريالات باسمك.')
    n.append(t)
    box.append(n)
  }
}

function renderRows() {
  const q = $('search').value.trim().toLowerCase()
  const all = data.rows
  const latest = latestByDevice(all)
  const rows = all.filter((r) => !q || [r.customer, r.phone, r.device, r.note].join(' ').toLowerCase().includes(q)).reverse()
  $('count').textContent = all.length ? `(${new Set(all.map((r) => r.device)).size} جهاز)` : ''
  $('export').hidden = !all.length
  $('empty').hidden = rows.length > 0
  $('empty').textContent = all.length ? 'ما في نتائج.' : 'لسا ما أصدرت ولا سيريال. أول سيريال بينضاف هون.'
  $('rows').hidden = !rows.length
  $('rows').replaceChildren(...rows.map((r) => {
    const s = status(r, latest.get(r.device), data.today)
    const row = el('article', 'lic')
    const title = el('div')
    title.append(el('strong', '', r.customer), el('span', `tag ${s.cls}`, s.text))
    const meta = el('div', 'meta')
    const code = el('span', 'code-t', r.device)
    meta.append(code)
    if (r.phone) { const ph = el('span', '', r.phone); ph.dir = 'ltr'; meta.append(ph) }
    meta.append(el('span', '', r.expires ? `لحد ${dateAr(r.expires)}` : 'بدون انتهاء'), el('span', '', `انصدر ${dateAr(r.issuedAt)}`))
    row.append(title, meta)
    if (r.note) row.append(el('div', 'note', r.note))
    const acts = el('div', 'acts')
    const reset = r.kind === 'reset'
    const cp = el('button', 'btn btn-s sm', reset ? 'انسخ المفتاح' : 'انسخ السيريال')
    cp.type = 'button'
    cp.setAttribute('aria-label', reset ? `انسخ مفتاح استرجاع ${r.customer}` : `انسخ سيريال ${r.customer}`)
    cp.addEventListener('click', () => copy(r.key, cp))
    acts.append(cp)
    if (!reset) {
      const rn = el('button', 'btn btn-s sm', 'جدّد')
      rn.type = 'button'
      rn.setAttribute('aria-label', `جدّد سيريال ${r.customer}`)
      rn.addEventListener('click', () => renew(r))
      acts.append(rn)
    }
    row.append(acts)
    return row
  }))
}

function renderSeen() {
  const box = $('device-seen')
  const code = $('device').value.toUpperCase().replace(/[\s‎‏-]/g, '')
  const seen = code.length === 10 ? data.rows.filter((r) => r.kind !== 'reset' && r.device.replace(/-/g, '') === code) : []
  box.hidden = !seen.length
  if (seen.length) {
    const last = seen[seen.length - 1]
    box.textContent = `هالجهاز إله سيريال باسم ${last.customer}، ${last.expires ? `لحد ${dateAr(last.expires)}` : 'بدون انتهاء'}. إذا بتصدر كمان واحد، بيكون تجديد.`
  }
}

function render() {
  $('nokey').hidden = data.keyReady
  $('nokey-dir').textContent = data.dir
  $('work').hidden = !data.keyReady
  $('export').href = `/api/export.csv?t=${encodeURIComponent(TOKEN)}`
  renderNotice()
  renderRows()
  renderSeen()
}

function durationValue() {
  return document.querySelector('input[name=dur]:checked').value
}

function syncDuration() {
  const v = durationValue()
  $('until-fld').hidden = v !== 'until'
  $('forever-note').hidden = v !== 'forever'
}

function setError(code) {
  const msg = code ? errorText(code) : ''
  $('form-err').hidden = !msg
  $('form-err').textContent = msg
  const bad = { customer_required: 'customer', device_invalid: 'device', until_invalid: 'until', until_past: 'until' }[code]
  for (const f of ['customer', 'device', 'until']) {
    $(`${f}-box`).classList.toggle('err', f === bad)
    if (f === bad) $(f).setAttribute('aria-invalid', 'true')
    else $(f).removeAttribute('aria-invalid')
  }
  if (bad) $(bad).focus()
}

function renew(r) {
  $('customer').value = r.customer
  $('device').value = r.device
  $('phone').value = r.phone || ''
  $('note').value = ''
  document.querySelector('input[name=dur][value="12"]').checked = true
  syncDuration()
  setError(null)
  $('result').hidden = true
  renderSeen()
  $('issue').focus()
  $('form-t').scrollIntoView({ block: 'nearest' })
  say(`جاهز تجدد لـ${r.customer}. اختار المدة واضغط أصدر السيريال.`)
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault()
  setError(null)
  const v = durationValue()
  const duration = v === 'forever' ? { kind: 'forever' } : v === 'until' ? { kind: 'until', date: $('until').value } : { kind: 'months', months: Number(v) }
  $('issue').disabled = true
  let r
  try {
    r = await call('/api/issue', { customer: $('customer').value, phone: $('phone').value, note: $('note').value, device: $('device').value, duration })
  } catch {
    r = { ok: false, error: 'failed' }
  }
  $('issue').disabled = false
  if (!r.ok) return setError(r.error)
  data.rows.push(r.value)
  $('result-t').textContent = `سيريال ${r.value.customer}، ${r.value.expires ? `لحد ${dateAr(r.value.expires)}` : 'بدون انتهاء'}. ابعته للزبون يلصقه بتبويب الترخيص.`
  $('result-key').textContent = r.value.key
  $('result').hidden = false
  $('result').focus()
  for (const id of ['customer', 'device', 'phone', 'note', 'until']) $(id).value = ''
  renderRows()
  renderSeen()
})

$('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  $('r-err').hidden = true
  for (const f of ['r-customer', 'r-device', 'r-request']) $(`${f}-box`).classList.remove('err')
  $('r-issue').disabled = true
  let r
  try {
    r = await call('/api/issue-reset', { customer: $('r-customer').value, device: $('r-device').value, request: $('r-request').value })
  } catch {
    r = { ok: false, error: 'failed' }
  }
  $('r-issue').disabled = false
  if (!r.ok) {
    $('r-err').textContent = errorText(r.error)
    $('r-err').hidden = false
    const bad = { customer_required: 'r-customer', device_invalid: 'r-device', request_invalid: 'r-request' }[r.error]
    if (bad) {
      $(`${bad}-box`).classList.add('err')
      $(bad).focus()
    }
    return
  }
  data.rows.push(r.value)
  $('r-result-t').textContent = `مفتاح استرجاع لـ${r.value.customer}، صالح لحد ${dateAr(r.value.expires)}. الزبون بيلصقه بشاشة «نسيت الرمز؟».`
  $('r-key').textContent = r.value.key
  $('r-result').hidden = false
  $('r-result').focus()
  for (const id of ['r-customer', 'r-device', 'r-request']) $(id).value = ''
  renderRows()
})
$('r-copy').addEventListener('click', (e) => copy($('r-key').textContent, e.currentTarget))
for (const r of document.querySelectorAll('input[name=dur]')) r.addEventListener('change', syncDuration)
$('device').addEventListener('input', renderSeen)
$('search').addEventListener('input', renderRows)
$('result-copy').addEventListener('click', (e) => copy($('result-key').textContent, e.currentTarget))
$('keygen').addEventListener('click', async () => {
  const r = await call('/api/keygen', {})
  if (!r.ok) return say(errorText(r.error))
  data = r.value
  render()
  $('customer').focus()
})
$('sync-no').addEventListener('click', () => $('sync-dlg').close())
$('sync-yes').addEventListener('click', async () => {
  $('sync-dlg').close()
  const r = await call('/api/sync-public-key', {})
  if (!r.ok) return say(errorText(r.error))
  data = r.value
  render()
  say('انعدل المفتاح بالبرنامج. ابني البرنامج من جديد قبل ما توزعه.')
})

call('/api/state').then((r) => {
  if (!r.ok) {
    $('notice').replaceChildren(el('div', 'bn er', errorText(r.error)))
    return
  }
  data = r.value
  syncDuration()
  render()
  if (data.keyReady) $('customer').focus()
}, () => {
  $('notice').replaceChildren(el('div', 'bn er', 'الأداة مش شغالة. شغّلها من جديد.'))
})
