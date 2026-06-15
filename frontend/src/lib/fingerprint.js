// Реальный fingerprint браузера.
//
// Цель — выдать стабильный SHA-256 hash + объект компонентов,
// который позволит антифроду:
//   1) сопоставлять «одно устройство» поверх разных аккаунтов;
//   2) видеть, какие именно атрибуты совпадают (даже если bot подменил
//      User-Agent или одно из полей).
//
// Реализовано без внешних библиотек (FingerprintJS и т.п.) — для прозрачности
// в ВКР и чтобы было видно, какие именно сигналы собираются.

async function sha256(input) {
  const bytes = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function getCanvasHash() {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 220
    canvas.height = 50
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.textBaseline = 'top'
    ctx.font = '14px "Arial"'
    ctx.fillStyle = '#f60'
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('AntifraudFP—Эпл Пипл 🛡', 2, 15)
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
    ctx.fillText('AntifraudFP—Эпл Пипл 🛡', 4, 17)

    return canvas.toDataURL()
  } catch {
    return null
  }
}

function getWebGLInfo() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return { vendor: null, renderer: null, available: false }

    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      shading: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      available: true,
    }
  } catch {
    return { vendor: null, renderer: null, available: false }
  }
}

async function getAudioHash() {
  try {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext
    if (!Ctx) return null

    const ctx = new Ctx(1, 44100, 44100)
    const oscillator = ctx.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.value = 10000

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -50
    compressor.knee.value = 40
    compressor.ratio.value = 12
    compressor.attack.value = 0
    compressor.release.value = 0.25

    oscillator.connect(compressor)
    compressor.connect(ctx.destination)
    oscillator.start(0)
    ctx.startRendering()

    const buffer = await new Promise(resolve => {
      ctx.oncomplete = event => resolve(event.renderedBuffer)
    })

    const channelData = buffer.getChannelData(0)
    let sum = 0
    for (let i = 4500; i < 5000; i++) sum += Math.abs(channelData[i])
    return sum.toString()
  } catch {
    return null
  }
}

function detectFonts() {
  // Лёгкая font detection: измеряем ширину строки в нескольких шрифтах.
  // Если шрифт отсутствует, браузер откатывается на дефолт и ширина совпадает с baseline.
  try {
    const baseFonts = ['monospace', 'sans-serif', 'serif']
    const probeFonts = [
      'Arial', 'Verdana', 'Times New Roman', 'Courier New',
      'Tahoma', 'Trebuchet MS', 'Comic Sans MS', 'Georgia', 'Impact',
      'Roboto', 'San Francisco', 'Segoe UI',
    ]

    const span = document.createElement('span')
    span.style.fontSize = '72px'
    span.style.position = 'absolute'
    span.style.left = '-9999px'
    span.innerHTML = 'mmmmmmmmmmlli'
    document.body.appendChild(span)

    const baseline = {}
    for (const bf of baseFonts) {
      span.style.fontFamily = bf
      baseline[bf] = span.offsetWidth
    }

    const detected = []
    for (const font of probeFonts) {
      let isDetected = false
      for (const bf of baseFonts) {
        span.style.fontFamily = `'${font}', ${bf}`
        if (span.offsetWidth !== baseline[bf]) {
          isDetected = true
          break
        }
      }
      if (isDetected) detected.push(font)
    }

    document.body.removeChild(span)
    return detected
  } catch {
    return []
  }
}

export async function collectFingerprint() {
  const screen = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const language = navigator.language || ''
  const languages = (navigator.languages || []).join(',')
  const platform = navigator.platform || ''
  const ua = navigator.userAgent || ''
  const cores = navigator.hardwareConcurrency || 0
  const memory = navigator.deviceMemory || 0
  const touchPoints = navigator.maxTouchPoints || 0

  const webgl = getWebGLInfo()
  const canvasFp = getCanvasHash()
  const audio = await getAudioHash()
  const fonts = detectFonts()

  const components = {
    screen,
    timezone: tz,
    language,
    languages,
    platform,
    user_agent: ua,
    hardware_concurrency: cores,
    device_memory: memory,
    max_touch_points: touchPoints,
    webgl_vendor: webgl.vendor,
    webgl_renderer: webgl.renderer,
    webgl_version: webgl.version,
    canvas_hash: canvasFp ? await sha256(canvasFp) : null,
    audio_hash: audio ? await sha256(audio) : null,
    fonts: fonts.join('|'),
    cookies_enabled: navigator.cookieEnabled,
    do_not_track: navigator.doNotTrack,
    color_gamut: window.matchMedia?.('(color-gamut: srgb)').matches ?? null,
  }

  const stableString = JSON.stringify({
    s: components.screen,
    t: components.timezone,
    l: components.languages,
    p: components.platform,
    hc: components.hardware_concurrency,
    dm: components.device_memory,
    mtp: components.max_touch_points,
    wv: components.webgl_vendor,
    wr: components.webgl_renderer,
    ch: components.canvas_hash,
    ah: components.audio_hash,
    f: components.fonts,
  })

  const fpHash = await sha256(stableString)
  return { fpHash, components, screen, timezone: tz, language, userAgent: ua }
}
