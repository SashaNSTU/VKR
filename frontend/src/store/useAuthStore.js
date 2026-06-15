import { create } from 'zustand'
import { authAPI } from '../api'
import { collectFingerprint } from '../lib/fingerprint'
import { detectAutomation } from '../lib/automation'

// Собираем сигналы клиента при каждом auth-запросе.
// Кэшируем результат fingerprint на сессию (он стабилен и тяжёлый по аудиту).
let cachedSignals = null

async function getClientSignals() {
  if (cachedSignals) return cachedSignals

  const fp = await collectFingerprint()
  const automation = detectAutomation()

  cachedSignals = {
    device_fingerprint: fp.fpHash,
    fp_hash: fp.fpHash,
    fp_components: fp.components,
    user_agent: fp.userAgent,
    automation_flags: automation,
    automation_score: automation.automation_score || 0,
  }
  return cachedSignals
}

export async function buildOrderSignals(behaviorSnapshot) {
  const base = await getClientSignals()
  return {
    ...base,
    timezone: base.fp_components?.timezone,
    language: base.fp_components?.language,
    screen: base.fp_components?.screen,
    ...behaviorSnapshot,
  }
}

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  loading: false,
  error: null,

  setToken: (token) => {
    localStorage.setItem('token', token)
    set({ token })
  },

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const signals = await getClientSignals()
      const { data } = await authAPI.login({ email, password, ...signals })
      localStorage.setItem('token', data.access_token)
      set({ token: data.access_token })
      await get().fetchMe()
      return true
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Ошибка входа' })
      return false
    } finally {
      set({ loading: false })
    }
  },

  register: async (formData) => {
    set({ loading: true, error: null })
    try {
      const signals = await getClientSignals()
      const { data } = await authAPI.register({ ...formData, ...signals })
      localStorage.setItem('token', data.access_token)
      set({ token: data.access_token })
      await get().fetchMe()
      return true
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Ошибка регистрации' })
      return false
    } finally {
      set({ loading: false })
    }
  },

  fetchMe: async () => {
    try {
      const { data } = await authAPI.me()
      set({ user: data })
    } catch {
      get().logout()
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    cachedSignals = null
    set({ user: null, token: null })
  },

  isAdmin: () => get().user?.role === 'admin',
  isAuth:  () => !!get().token,
}))

export default useAuthStore
