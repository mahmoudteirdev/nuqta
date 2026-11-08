import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { startBackend } from './backend'
import { allowDevEnv, devEnv } from './dev-env'

if (!app.isPackaged) allowDevEnv()

// النسخة المبنية ما بتفتح منفذ تشخيص: اللي بيوصله بيقدر يتحكم بالنوافذ.
const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk']
if (app.isPackaged && DEBUG_SWITCHES.some((s) => app.commandLine.hasSwitch(s))) app.exit(1)

// اسم البرنامج بشريط المهام والإشعارات، لازم يطابق appId بالبناء.
app.setAppUserModelId('com.mahmoudteirdev.nuqta')

// البرنامج لازم يشتغل بدون نت: ما في أي تحميل من مصدر خارجي.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'self' ws://localhost:*"
].join('; ')

let mainWindow: BrowserWindow | null = null

function createWindow(defaultTitle = 'نقطة'): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 600,
    show: false,
    backgroundColor: '#F4F5F0',
    title: defaultTitle,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
  })

  mainWindow = win
  win.on('closed', () => { if (mainWindow === win) mainWindow = null })
  win.once('ready-to-show', () => win.show())

  // أثناء التطوير: رسائل الواجهة وأخطاؤها بتطلع في الطرفية.
  if (!app.isPackaged) {
    win.webContents.on('console-message', (e) => console.log(`[renderer:${e.level}] ${e.message}`))
    win.webContents.on('preload-error', (_e, path, err) => console.error(`[preload] ${path}: ${err.message}`))
  }

  // أي رابط خارجي بيفتح في المتصفح، والنافذة ما بتتنقل لبره البرنامج.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = devEnv('ELECTRON_RENDERER_URL')
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault()
  })

  const devUrl = devEnv('ELECTRON_RENDERER_URL')
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

// نسخة وحدة بس: نسختين بيكتبوا على نفس قاعدة البيانات وبيبعتوا لنفس الراوتر.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    const status = startBackend()
    if (!app.isPackaged) console.log('[backend]', JSON.stringify(status))
    const initialTitle = status.installerLang === 'en' ? 'Nuqta' : 'نقطة'
    createWindow(initialTitle)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(initialTitle)
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
