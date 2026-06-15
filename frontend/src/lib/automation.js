// Детектирование признаков автоматизации браузера (BAS / Selenium / Puppeteer / Playwright).
//
// Каждый признак — отдельный булев флаг + общий automation_score (0..100).
// Антифрод-бэк использует score для правила BAS_AUTOMATION_DETECTED,
// а отдельные флаги пишутся в order_automation_flags для разбора.
//
// Эта функция не делает «защиту» — её можно подделать. Но конкретно BAS
// в дефолтных конфигурациях оставляет несколько таких признаков одновременно,
// и для прохождения ВКР-сценариев этого достаточно.

const isObject = v => v !== null && typeof v === 'object'

export function detectAutomation() {
  const flags = {}
  let score = 0
  const add = (key, value, weight) => {
    flags[key] = value
    if (value) score += weight
  }

  // 1. Явный webdriver
  add('webdriver', Boolean(navigator.webdriver), 35)

  // 2. Отсутствие plugins (в обычном Chrome их 3+)
  const pluginsLen = navigator.plugins?.length ?? 0
  add('no_plugins', pluginsLen === 0, 15)

  // 3. Пустой список языков (норма — хотя бы 1)
  add('empty_languages', (navigator.languages?.length ?? 0) === 0, 10)

  // 4. Headless-индикаторы WebGL
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
      const vendor   = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR)
      add('webgl_swiftshader', /swiftshader/i.test(renderer || ''), 20)
      add('webgl_llvmpipe',    /llvmpipe/i.test(renderer || ''), 20)
      add('webgl_vendor_google_inc', /Google Inc/i.test(vendor || '') && /swift/i.test(renderer || ''), 15)
    } else {
      add('webgl_unavailable', true, 25)
    }
  } catch {
    add('webgl_error', true, 15)
  }

  // 5. Permissions API quirks (headless Chrome возвращает странные значения)
  try {
    if (navigator.permissions?.query) {
      // Не await'им — это эвристика на «forms answer immediately»;
      // нам важен сам факт наличия API.
      add('has_permissions_api', false, 0)  // нейтральный
    } else {
      add('has_permissions_api', true, 5)
    }
  } catch {
    /* ignore */
  }

  // 6. Chrome глобал отсутствует, а UA говорит Chrome
  const ua = navigator.userAgent || ''
  const looksChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)
  const hasChromeRuntime = isObject(window.chrome) && isObject(window.chrome.runtime)
  add('ua_chrome_without_chrome_runtime', looksChrome && !hasChromeRuntime, 15)

  // 7. Несоответствие navigator.platform и UA
  const plat = (navigator.platform || '').toLowerCase()
  const uaLower = ua.toLowerCase()
  let mismatch = false
  if (plat.includes('win') && !uaLower.includes('windows')) mismatch = true
  if (plat.includes('mac') && !uaLower.includes('mac')) mismatch = true
  if (plat.includes('linux') && !uaLower.includes('linux') && !uaLower.includes('android')) mismatch = true
  add('platform_ua_mismatch', mismatch, 15)

  // 8. Подозрительная плотность пикселей / нулевые размеры
  add('zero_screen', (window.screen.width === 0 || window.screen.height === 0), 25)
  add('outer_inner_mismatch', window.outerWidth === 0 && window.innerWidth > 0, 15)

  // 9. iframe / popup без opener (BAS часто запускает в iframe)
  add('is_iframe', window.top !== window.self, 10)

  // 10. Timezone vs язык — грубая эвристика
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    const lang = (navigator.language || '').toLowerCase()
    let tzLangMismatch = false
    if (lang.startsWith('ru') && !/(moscow|samara|yekaterinburg|novosibirsk|krasnoyarsk|irkutsk|yakutsk|vladivostok|magadan|kamchatka|kaliningrad|europe\/moscow|asia\/)/i.test(tz)) {
      tzLangMismatch = true
    }
    flags.timezone_lang_mismatch = tzLangMismatch
    if (tzLangMismatch) score += 10
  } catch {
    /* ignore */
  }

  // 11. CDC / Selenium-специфичные ключи
  const hasCdcKeys = Object.keys(window).some(k => /^cdc_|^_selenium|^__webdriver/.test(k))
  add('cdc_keys_present', hasCdcKeys, 25)

  flags.automation_score = Math.min(score, 100)
  return flags
}
