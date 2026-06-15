import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8002',
  headers: { 'Content-Type': 'application/json' },
})

// ── X-Test-IP для BAS-тестов ──────────────────────────────────────
// Если открыть страницу с ?test_ip=8.8.8.42 — IP сохранится в localStorage
// и будет автоматически отправляться в заголовке X-Test-IP во всех запросах.
// Чтобы выключить — открыть страницу с ?test_ip=clear или вызвать
// localStorage.removeItem('test_ip') в DevTools.
try {
  const params = new URLSearchParams(window.location.search)
  const testIp = params.get('test_ip')
  if (testIp === 'clear' || testIp === 'off') {
    localStorage.removeItem('test_ip')
  } else if (testIp) {
    localStorage.setItem('test_ip', testIp)
  }
} catch {
  /* ignore */
}

// Добавляем заголовки к каждому запросу
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  const testIp = localStorage.getItem('test_ip')
  if (testIp) config.headers['X-Test-IP'] = testIp

  return config
})

// Обрабатываем 401 — разлогиниваем
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
