import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'

export default function RegisterPage() {
  const { register, loading, error } = useAuthStore()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    // BAS fills inputs via direct DOM assignment (element.value = ...) which bypasses
    // React's onChange, leaving state empty. Read raw DOM values as authoritative source.
    const els = e.currentTarget.elements
    const domVal = (name) => els.namedItem(name)?.value ?? ''
    const data = {
      email:     domVal('email')     || form.email,
      password:  domVal('password')  || form.password,
      full_name: domVal('full_name') || form.full_name,
      phone:     domVal('phone')     || form.phone,
    }
    const ok = await register(data)
    if (ok) navigate('/')
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/images/logoheader.png" alt="Эпл Пипл" className="h-10 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-brand-navy">Создать аккаунт</h1>
          <p className="text-gray-400 text-sm mt-1">Это займёт меньше минуты</p>
        </div>
        <form onSubmit={handleSubmit} className="card p-8 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Имя и фамилия</label>
            <input className="input" name="full_name" value={form.full_name}
              onChange={e => set('full_name', e.target.value)} placeholder="Иван Иванов" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Email *</label>
            <input className="input" name="email" type="email" required value={form.email}
              onChange={e => set('email', e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Телефон</label>
            <input className="input" name="phone" value={form.phone}
              onChange={e => set('phone', e.target.value)} placeholder="+7 999 999 99 99" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Пароль *</label>
            <input className="input" name="password" type="password" required minLength={6}
              value={form.password} onChange={e => set('password', e.target.value)}
              placeholder="Минимум 6 символов" />
          </div>
          {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? 'Регистрируем...' : 'Зарегистрироваться'}
          </button>
          <p className="text-center text-sm text-gray-400 pt-2">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-accent hover:underline font-medium">Войти</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
