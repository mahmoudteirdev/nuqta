// اتصال واحد بالراوتر. api-ssl على 8729 بشكل افتراضي. الأوامر بتمشي بوسوم (.tag) فممكن أكثر من أمر بنفس الوقت.

import { createHash } from 'node:crypto'
import { connect as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'
import { encodeSentence, parseAttributes, SentenceReader, type Reply } from './protocol'
import { RouterError } from './types'

export interface ConnectionOptions {
  host: string
  port?: number
  user: string
  password: string
  /** false بس للاختبار أو لـapi العادي على 8728. الإنتاج دايما TLS. */
  tls?: boolean
  /** بصمة الشهادة المحفوظة. إذا موجودة وتغيرت، الاتصال بيوقف. */
  fingerprint?: string | null
  timeoutMs?: number
}

interface Pending {
  rows: Record<string, string>[]
  resolve: (r: Reply) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

export class ApiConnection {
  #socket: Socket | TLSSocket
  #reader = new SentenceReader()
  #pending = new Map<string, Pending>()
  #seq = 0
  #closed = false
  readonly fingerprint: string | null

  private constructor(socket: Socket | TLSSocket, fingerprint: string | null, private readonly timeoutMs: number) {
    this.#socket = socket
    this.fingerprint = fingerprint
    socket.on('data', (chunk: Buffer) => {
      for (const s of this.#reader.push(chunk)) this.#onSentence(s)
    })
    socket.on('close', () => this.#fail(new RouterError('closed', 'connection closed')))
    socket.on('error', (e) => this.#fail(new RouterError('unreachable', e.message)))
  }

  static async open(o: ConnectionOptions): Promise<ApiConnection> {
    const useTls = o.tls ?? true
    const port = o.port ?? (useTls ? 8729 : 8728)
    const timeoutMs = o.timeoutMs ?? 8000
    const socket = await new Promise<Socket | TLSSocket>((resolve, reject) => {
      // الراوتر عادة شهادته موقعة ذاتيا أو بإعدادات قديمة، فالأمان من تثبيت البصمة تحت مش من سلسلة الثقة.
      const s = useTls
        ? tlsConnect({
            host: o.host,
            port,
            rejectUnauthorized: false,
            minVersion: 'TLSv1',
            ciphers: 'ALL:@SECLEVEL=0'
          }, () => resolve(s))
        : netConnect({ host: o.host, port }, () => resolve(s))
      const timer = setTimeout(() => {
        s.destroy()
        reject(new RouterError('timeout', `no answer from ${o.host}:${port}`))
      }, timeoutMs)
      s.once('connect', () => clearTimeout(timer))
      s.once('secureConnect', () => clearTimeout(timer))
      s.once('error', (e) => {
        clearTimeout(timer)
        reject(new RouterError('unreachable', e.message))
      })
    })

    let fingerprint: string | null = null
    if (useTls) {
      const cert = (socket as TLSSocket).getPeerCertificate?.()
      fingerprint = cert?.fingerprint256 || cert?.fingerprint || null
      if (o.fingerprint && fingerprint && fingerprint !== o.fingerprint) {
        socket.destroy()
        throw new RouterError('tls_mismatch', 'router certificate changed')
      }
    }

    const c = new ApiConnection(socket, fingerprint, timeoutMs)
    try {
      // تسجيل الدخول: نجرب 6.43+ أولاً (بكلمة المرور مباشرة).
      // إذا الراوتر أقدم (pre-6.43) ورد بتحدي =ret=...، بنرد بحساب MD5 للتحدي.
      const loginRes = await c.command(['/login', `=name=${o.user}`, `=password=${o.password}`])
      const challenge = loginRes.done['ret']
      if (challenge) {
        const md5 = createHash('md5')
        md5.update(Buffer.from([0]))
        md5.update(Buffer.from(o.password, 'utf8'))
        md5.update(Buffer.from(challenge, 'hex'))
        const response = '00' + md5.digest('hex')
        await c.command(['/login', `=name=${o.user}`, `=response=${response}`])
      }
    } catch (e) {
      c.close()
      if (e instanceof RouterError && e.code === 'trap') throw new RouterError('auth', e.message)
      throw e
    }
    return c
  }

  command(words: readonly string[]): Promise<Reply> {
    if (this.#closed) return Promise.reject(new RouterError('closed'))
    const tag = String(++this.#seq)
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(tag)
        reject(new RouterError('timeout', `${words[0]} timed out`))
      }, this.timeoutMs)
      this.#pending.set(tag, { rows: [], resolve, reject, timer })
      this.#socket.write(encodeSentence([...words, `.tag=${tag}`]))
    })
  }

  #onSentence(words: string[]): void {
    const [type, ...rest] = words
    const tagWord = rest.find((w) => w.startsWith('.tag='))
    if (type === '!fatal') {
      this.#fail(new RouterError('closed', rest.join(' ')))
      return
    }
    const p = tagWord ? this.#pending.get(tagWord.slice(5)) : undefined
    if (!p) return
    const attrs = parseAttributes(rest)
    if (type === '!re') p.rows.push(attrs)
    else if (type === '!trap') {
      // بعد !trap بيوصل !done لنفس الوسم. بنرفض هون وبنشيل الوسم.
      this.#settle(tagWord!.slice(5))
      p.reject(new RouterError('trap', attrs['message'] ?? 'router refused the command'))
    } else if (type === '!done' || type === '!empty') {
      if (type === '!done') this.#settle(tagWord!.slice(5))
      if (type === '!done') p.resolve({ rows: p.rows, done: attrs })
    }
  }

  #settle(tag: string): void {
    const p = this.#pending.get(tag)
    if (p) clearTimeout(p.timer)
    this.#pending.delete(tag)
  }

  #fail(e: RouterError): void {
    for (const [tag, p] of this.#pending) {
      clearTimeout(p.timer)
      p.reject(e)
      this.#pending.delete(tag)
    }
    this.#closed = true
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#socket.end()
    this.#socket.destroy()
  }
}
