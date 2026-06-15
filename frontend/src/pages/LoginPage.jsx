import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'

export default function LoginPage() {
  const { login, loading, error } = useAuthStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const els = e.currentTarget.elements
    const domEmail    = els.namedItem('email')?.value    || email
    const domPassword = els.namedItem('password')?.value || password
    const ok = await login(domEmail, domPassword)
    if (ok) navigate('/')
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/images/logoheader.png" alt="Эпл Пипл" className="h-10 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-brand-navy">Войти в аккаунт</h1>
          <p className="text-gray-400 text-sm mt-1">Введите ваши данные</p>
        </div>
        <form onSubmit={handleSubmit} className="card p-8 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
            <input className="input" name="email" type="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Пароль</label>
            <input className="input" name="password" type="password" required
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" />
          </div>
          {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? 'Входим...' : 'Войти'}
          </button>
          <p className="text-center text-sm text-gray-400 pt-2">
            Нет аккаунта?{' '}
            <Link to="/register" className="text-accent hover:underline font-medium">Зарегистрироваться</Link>
          </p>
        </form>
        <div className="mt-4 bg-gray-100 rounded-xl p-3 text-xs text-gray-400 text-center">
          Тест: <strong>test@test.ru</strong> / <strong>test123</strong>
        </div>
      </div>
    </div>
  )
}
