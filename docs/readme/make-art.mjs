// بيولّد الصور المتحركة تبعت README من خطوط البرنامج وألوانه:  node docs/readme/make-art.mjs
// الحركة كلها CSS، فـprefers-reduced-motion بيوقفها، والشكل الأخير مقروء بدون حركة.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { glyphPath, layoutText, loadFont, textPath, textWidth } from './font-paths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const F = join(HERE, '../../app/node_modules/@fontsource')
const bold = loadFont(join(F, 'ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-700-normal.woff'))
const regular = loadFont(join(F, 'ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff'))
const arabic = loadFont(join(F, 'ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff'))
const mono = loadFont(join(F, 'ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff'))

const C = { ink: '#13201D', deep: '#0C1714', teal: '#0A5C56', mint: '#5FC4B4', ground: '#F4F5F0', dim: '#8FA39C', line: '#2F4640', signal: '#F26B21' }
const r2 = (n) => Math.round(n * 100) / 100

// ───── الهيدر

function header() {
  const W = 1280
  const H = 440
  const hub = { x: 1046, y: 192 }
  const nodes = [
    { x: 1046, y: 52 }, { x: 1186, y: 112 }, { x: 1206, y: 270 },
    { x: 1046, y: 342 }, { x: 890, y: 278 }, { x: 874, y: 104 }
  ]

  // الكلمة: كل حرف بيطلع لحاله.
  const word = layoutText(bold, 'Nuqta', 236, 204, 136, { tracking: -2 })
  const letters = word.glyphs.map((g, i) => `<path class="letter" style="animation-delay:${r2(0.95 + i * 0.09)}s" d="${g.d}"/>`).join('')

  // نُقطة بالعربي: حروف موصولة بأشكالها، من اليمين لليسار.
  const arSize = 74
  const arScale = arSize / arabic.unitsPerEm
  const forms = [0xfee7, 0xfed8, 0xfec4, 0xfe94].map((c) => arabic.cmap.get(c))
  const mark = arabic.cmap.get(0x64f)
  const arTotal = forms.reduce((a, g) => a + arabic.advance(g) * arScale, 0)
  const arLeft = 236 + word.width + 34
  let pen = arLeft + arTotal
  let ar = ''
  forms.forEach((g, i) => {
    pen -= arabic.advance(g) * arScale
    ar += glyphPath(arabic, g, pen, 204, arSize)
    if (i === 0) ar += glyphPath(arabic, mark, pen + arabic.advance(g) * arScale * 0.5, 204, arSize)
  })

  const tagline = textPath(regular, 'The offline ledger for MikroTik hotspot networks', 72, 272, 29)

  // الخطوات تحت الجملة.
  let chipX = 72
  const chips = ['Generate', 'Print', 'Deliver', 'Settle'].map((label, i) => {
    const w = textWidth(bold, label, 21) + 36
    const out = `<g class="chip" style="animation-delay:${r2(2.05 + i * 0.12)}s"><rect x="${r2(chipX)}" y="300" width="${r2(w)}" height="44" rx="22" fill="none" stroke="${i === 3 ? C.signal : C.mint}" stroke-width="2"/><path fill="${i === 3 ? C.signal : C.ground}" d="${textPath(bold, label, chipX + 18, 329, 21)}"/></g>`
    chipX += w + 12
    return out
  }).join('')

  const edges = nodes.map((n, i) => `<line class="edge" style="animation-delay:${r2(1.2 + i * 0.08)}s" x1="${hub.x}" y1="${hub.y}" x2="${n.x}" y2="${n.y}"/>`).join('')

  const nodeMarks = nodes.map((n, i) => `<g class="node" style="animation-delay:${r2(1.35 + i * 0.1)}s"><circle class="ping" style="animation-delay:${r2(i * 0.75 + 3.4)}s" cx="${n.x}" cy="${n.y}" r="17"/><circle cx="${n.x}" cy="${n.y}" r="17" fill="${C.ink}" stroke="${C.mint}" stroke-width="2.5"/><circle cx="${n.x}" cy="${n.y}" r="5.5" fill="${C.mint}"/></g>`).join('')

  // كروت طالعة من الراوتر، وتحصيل راجع.
  const keyframes = []
  const packets = nodes.map((n, i) => {
    const dx = n.x - hub.x
    const dy = n.y - hub.y
    keyframes.push(`@keyframes out${i}{0%{transform:translate(0,0);opacity:0}6%{opacity:1}30%{opacity:1}36%{transform:translate(${dx}px,${dy}px);opacity:0}100%{transform:translate(${dx}px,${dy}px);opacity:0}}`)
    keyframes.push(`@keyframes back${i}{0%,50%{transform:translate(${dx}px,${dy}px);opacity:0}56%{opacity:1}80%{opacity:1}86%{transform:translate(0,0);opacity:0}100%{transform:translate(0,0);opacity:0}}`)
    const d = r2(2.6 + i * 0.75)
    return `<rect class="pk" style="animation-name:out${i};animation-delay:${d}s" x="${hub.x - 9}" y="${hub.y - 6}" width="18" height="12" rx="3" fill="${C.signal}"/><circle class="pk" style="animation-name:back${i};animation-delay:${d}s" cx="${hub.x}" cy="${hub.y}" r="6" fill="${C.mint}"/>`
  }).join('')

  // كروت بأكوادها طايرة حوالين الشبكة.
  const cards = [
    { x: 846, y: 176, code: '7KQM-2XPA', delay: 3.2 },
    { x: 1092, y: 300, code: 'H9TD-4WRE', delay: 5.6 },
    { x: 1076, y: 66, code: 'B3NF-8GVK', delay: 8 }
  ].map((c) => {
    const w = textWidth(mono, c.code, 17) + 26
    return `<g class="card" style="animation-delay:${c.delay}s"><rect x="${c.x}" y="${c.y}" width="${r2(w)}" height="34" rx="6" fill="${C.ground}"/><path fill="${C.ink}" d="${textPath(mono, c.code, c.x + 13, c.y + 23, 17)}"/></g>`
  }).join('')

  // شريط الحركات: نسختين ورا بعض عشان اللف ما يبين.
  const events = 'B-1008 SENT 100 CARDS   /   ROUTER CONFIRMED 88   /   PRINTED ONLY WHAT IS CONFIRMED   /   DELIVERED TO DISTRIBUTOR   /   7KQM-2XPA FIRST USE   /   DEBT ADDED ONCE   /   SETTLED AND LOGGED   /   NO INTERNET NEEDED   /   '
  const tickerW = textWidth(mono, events, 18)
  const tickerPath = textPath(mono, events, 0, 0, 18)

  const css = `
.letter,.chip,.tag,.ar{animation:rise .75s cubic-bezier(.2,.9,.25,1.15) both}
.ar{animation:fadeUp .8s ease-out 1.55s both}
.tag{animation:fadeUp .8s ease-out 1.8s both}
.arc{stroke-dasharray:1;stroke-dashoffset:0;animation:draw .9s cubic-bezier(.6,0,.2,1) .15s both}
.dot{transform-box:fill-box;transform-origin:center;animation:drop .85s cubic-bezier(.3,1.5,.5,1) .75s both,breathe 3.2s ease-in-out 2.4s infinite}
.ring{fill:none;stroke:${C.signal};stroke-width:2.5;vector-effect:non-scaling-stroke;transform-box:fill-box;transform-origin:center;opacity:0;animation:signal 3.6s ease-out infinite}
.edge{stroke:${C.line};stroke-width:2;animation:fadeIn .7s ease-out both}
.node{transform-box:fill-box;transform-origin:center;animation:pop .6s cubic-bezier(.3,1.6,.5,1) both}
.ping{fill:none;stroke:${C.mint};stroke-width:2;vector-effect:non-scaling-stroke;transform-box:fill-box;transform-origin:center;opacity:0;animation:ping 4.5s ease-out infinite}
.hub{transform-box:fill-box;transform-origin:center;animation:pop .7s cubic-bezier(.3,1.6,.5,1) 1.1s both}
.hubring{fill:none;stroke:${C.signal};stroke-width:2;vector-effect:non-scaling-stroke;transform-box:fill-box;transform-origin:center;opacity:0;animation:hubring 3s ease-out infinite}
.pk{opacity:0;animation-duration:4.5s;animation-timing-function:cubic-bezier(.45,0,.55,1);animation-iteration-count:infinite;animation-fill-mode:both}
.card{transform-box:fill-box;transform-origin:center;opacity:0;animation:floatcard 7.2s ease-in-out infinite}
.glow1{animation:drift1 16s ease-in-out infinite alternate}
.glow2{animation:drift2 20s ease-in-out infinite alternate}
.ticker{animation:fadeIn 1s ease-out 2.6s both}
.track{animation:slide 42s linear infinite}
@keyframes rise{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes draw{from{stroke-dashoffset:1;opacity:0}12%{opacity:1}to{stroke-dashoffset:0;opacity:1}}
@keyframes drop{from{transform:translateY(-120px);opacity:0}45%{opacity:1}to{transform:translateY(0);opacity:1}}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
@keyframes signal{0%{transform:scale(.45);opacity:0}12%{opacity:.85}100%{transform:scale(4.2);opacity:0}}
@keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes ping{0%,70%{transform:scale(1);opacity:0}74%{opacity:.8}100%{transform:scale(2.3);opacity:0}}
@keyframes hubring{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.1);opacity:0}}
@keyframes floatcard{0%{opacity:0;transform:translateY(14px) rotate(-3deg)}8%,30%{opacity:1;transform:translateY(0) rotate(-3deg)}38%,100%{opacity:0;transform:translateY(-14px) rotate(-3deg)}}
@keyframes drift1{from{transform:translate(0,0)}to{transform:translate(180px,50px)}}
@keyframes drift2{from{transform:translate(0,0)}to{transform:translate(-200px,-40px)}}
@keyframes slide{from{transform:translateX(0)}to{transform:translateX(-${r2(tickerW)}px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.ring,.ping,.pk,.card,.hubring{display:none}}
${keyframes.join('\n')}
`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">Nuqta</title>
<desc id="d">Nuqta, the offline ledger for MikroTik hotspot networks. The logo draws itself while voucher cards travel from a router to distributors.</desc>
<style>${css}</style>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.deep}"/><stop offset=".55" stop-color="${C.ink}"/><stop offset="1" stop-color="#0B3F3A"/></linearGradient>
<radialGradient id="g1"><stop offset="0" stop-color="${C.teal}" stop-opacity=".75"/><stop offset="1" stop-color="${C.teal}" stop-opacity="0"/></radialGradient>
<radialGradient id="g2"><stop offset="0" stop-color="${C.signal}" stop-opacity=".2"/><stop offset="1" stop-color="${C.signal}" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="${C.mint}" opacity=".16"/></pattern>
<clipPath id="round"><rect width="${W}" height="${H}" rx="20"/></clipPath>
</defs>
<g clip-path="url(#round)">
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<circle class="glow1" cx="260" cy="130" r="430" fill="url(#g1)"/>
<circle class="glow2" cx="1060" cy="230" r="360" fill="url(#g2)"/>
<rect width="${W}" height="${H}" fill="url(#grid)"/>

<g transform="translate(70 62) scale(3.05)">
<g transform="translate(24 10)">
<circle class="ring" style="animation-delay:2.6s" r="6.5"/>
<circle class="ring" style="animation-delay:3.8s" r="6.5"/>
<circle class="ring" style="animation-delay:5s" r="6.5"/>
</g>
<path class="arc" pathLength="1" d="M5.5 21v4a18.5 18.5 0 0 0 37 0v-4" fill="none" stroke="${C.ground}" stroke-width="7.5" stroke-linecap="round"/>
<circle class="dot" cx="24" cy="10" r="6.5" fill="${C.signal}"/>
</g>
<g fill="${C.ground}">${letters}</g>
<path class="ar" fill="${C.signal}" d="${ar}"/>
<path class="tag" fill="#C9D6D0" d="${tagline}"/>
${chips}

${edges}
${packets}
${nodeMarks}
<circle class="hubring" style="animation-delay:2.2s" cx="${hub.x}" cy="${hub.y}" r="44"/>
<g class="hub"><circle cx="${hub.x}" cy="${hub.y}" r="44" fill="${C.ink}" stroke="${C.signal}" stroke-width="3"/>
<g transform="translate(${hub.x - 24 * 1.2} ${hub.y - 24 * 1.2 + 1}) scale(1.2)"><path d="M5.5 21v4a18.5 18.5 0 0 0 37 0v-4" fill="none" stroke="${C.ground}" stroke-width="7.5" stroke-linecap="round"/><circle cx="24" cy="10" r="6.5" fill="${C.signal}"/></g></g>
${cards}

<g class="ticker"><rect y="${H - 54}" width="${W}" height="54" fill="${C.deep}" opacity=".78"/><rect y="${H - 54}" width="${W}" height="1" fill="${C.line}"/>
<g class="track"><path id="tick" fill="${C.dim}" transform="translate(0 ${H - 21})" d="${tickerPath}"/><use href="#tick" x="${r2(tickerW)}"/></g></g>
</g>
</svg>
`
}

// ───── رحلة الكرت

function flow() {
  const W = 1280
  const H = 320
  const CYCLE = 15
  const steps = [
    ['Generate', 'unique codes'],
    ['Send', 'router confirms'],
    ['Print', 'confirmed only'],
    ['Deliver', 'to a distributor'],
    ['First use', 'debt, once per card'],
    ['Settle', 'append-only ledger']
  ]
  const left = 116
  const gap = (W - left * 2) / (steps.length - 1)
  const lineY = 142
  const xOf = (i) => left + i * gap
  // كل خطوة بتاخد حصتها: وصول، وقفة، انتقال.
  const share = 88 / steps.length
  const at = (i) => r2(4 + i * share)

  const frames = []
  let travel = ''
  steps.forEach((_, i) => {
    const dx = r2(xOf(i) - left)
    travel += `${at(i)}%{transform:translateX(${dx}px)}${r2(at(i) + share * 0.55)}%{transform:translateX(${dx}px)}`
    frames.push(`@keyframes lit${i}{0%,${r2(at(i) - 0.6)}%{fill:${C.ink};stroke:${C.line}}${at(i)}%,95%{fill:${C.signal};stroke:${C.signal}}100%{fill:${C.ink};stroke:${C.line}}}`)
    frames.push(`@keyframes num${i}{0%,${r2(at(i) - 0.6)}%{fill:${C.dim}}${at(i)}%,95%{fill:#FFFFFF}100%{fill:${C.dim}}}`)
    frames.push(`@keyframes title${i}{0%,${r2(at(i) - 0.6)}%{fill:${C.dim}}${at(i)}%,95%{fill:${C.ground}}100%{fill:${C.dim}}}`)
    frames.push(`@keyframes burst${i}{0%,${r2(at(i) - 0.2)}%{transform:scale(1);opacity:0}${r2(at(i) + 0.4)}%{opacity:.9}${r2(at(i) + 6)}%,100%{transform:scale(2.5);opacity:0}}`)
  })
  const lastX = r2(xOf(steps.length - 1) - left)
  frames.push(`@keyframes token{0%{transform:translateX(0);opacity:0}2%{opacity:1}${travel}95%{transform:translateX(${lastX}px);opacity:1}98%,100%{transform:translateX(${lastX}px);opacity:0}}`)
  const lineEnd = `${at(steps.length - 1)}%`
  frames.push(`@keyframes progress{0%,${at(0)}%{stroke-dashoffset:1}${steps.map((_, i) => `${at(i)}%{stroke-dashoffset:${r2(1 - i / (steps.length - 1))}}${r2(at(i) + share * 0.55)}%{stroke-dashoffset:${r2(1 - i / (steps.length - 1))}}`).join('')}${lineEnd}{stroke-dashoffset:0}95%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}`)

  const marks = steps.map(([title, sub], i) => {
    const x = xOf(i)
    const tw = textWidth(bold, title, 25)
    const sw = textWidth(regular, sub, 18)
    const nw = textWidth(bold, String(i + 1), 21)
    return `<circle class="burst" style="animation-name:burst${i}" cx="${r2(x)}" cy="${lineY}" r="26"/>
<circle class="stop" style="animation-name:lit${i}" cx="${r2(x)}" cy="${lineY}" r="26" fill="${C.signal}" stroke="${C.signal}" stroke-width="3"/>
<path class="stop" style="animation-name:num${i}" fill="#FFFFFF" d="${textPath(bold, String(i + 1), x - nw / 2, lineY + 8, 21)}"/>
<path class="stop" style="animation-name:title${i}" fill="${C.ground}" d="${textPath(bold, title, x - tw / 2, lineY + 72, 25)}"/>
<path fill="${C.dim}" d="${textPath(regular, sub, x - sw / 2, lineY + 102, 18)}"/>`
  }).join('\n')

  const heading = 'One card, from code to cash'
  const hw = textWidth(bold, heading, 30)

  const css = `
.stop{animation-duration:${CYCLE}s;animation-timing-function:ease-out;animation-iteration-count:infinite;animation-fill-mode:both}
.burst{fill:none;stroke:${C.signal};stroke-width:2.5;vector-effect:non-scaling-stroke;transform-box:fill-box;transform-origin:center;opacity:0;animation-duration:${CYCLE}s;animation-timing-function:ease-out;animation-iteration-count:infinite}
.progress{stroke-dasharray:1;stroke-dashoffset:0;animation:progress ${CYCLE}s cubic-bezier(.65,0,.35,1) infinite}
.token{opacity:0;animation:token ${CYCLE}s cubic-bezier(.65,0,.35,1) infinite}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.token,.burst{display:none}}
${frames.join('\n')}
`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="ft fd">
<title id="ft">The life of a voucher card in Nuqta</title>
<desc id="fd">Six steps: generate unique codes, send them so the router confirms, print confirmed cards only, deliver to a distributor, add debt once per card at first use, and settle in an append-only ledger.</desc>
<style>${css}</style>
<defs><linearGradient id="fbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.deep}"/><stop offset="1" stop-color="#0B3F3A"/></linearGradient><clipPath id="fr"><rect width="${W}" height="${H}" rx="20"/></clipPath></defs>
<g clip-path="url(#fr)">
<rect width="${W}" height="${H}" fill="url(#fbg)"/>
<path fill="${C.ground}" d="${textPath(bold, heading, (W - hw) / 2, 62, 30)}"/>
<line x1="${left}" y1="${lineY}" x2="${W - left}" y2="${lineY}" stroke="${C.line}" stroke-width="5" stroke-linecap="round"/>
<line class="progress" pathLength="1" x1="${left}" y1="${lineY}" x2="${W - left}" y2="${lineY}" stroke="${C.signal}" stroke-width="5"/>
${marks}
<g class="token"><rect x="${left - 25}" y="${lineY - 48}" width="50" height="30" rx="5" fill="${C.ground}"/><rect x="${left - 18}" y="${lineY - 40}" width="36" height="5" rx="2.5" fill="${C.ink}"/><rect x="${left - 18}" y="${lineY - 30}" width="20" height="5" rx="2.5" fill="${C.signal}"/></g>
</g>
</svg>
`
}

writeFileSync(join(HERE, 'header.svg'), header())
writeFileSync(join(HERE, 'flow.svg'), flow())
console.log('wrote header.svg and flow.svg')
