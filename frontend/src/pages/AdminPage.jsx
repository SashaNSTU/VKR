import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'
import api from '../api/client'
import { adminAPI } from '../api'

const TABS = ['📦 Товары', '🧾 Заказы', '👥 Пользователи', '🎟 Промокоды', '🔒 Антифрод']

const STATUS_MAP = {
  pending:        { label: 'Ожидает',     color: 'bg-yellow-100 text-yellow-700' },
  pending_review: { label: 'На проверке', color: 'bg-orange-100 text-orange-700' },
  paid:           { label: 'Оплачен',     color: 'bg-blue-100 text-blue-700' },
  processing:     { label: 'Обработка',   color: 'bg-blue-100 text-blue-700' },
  shipped:        { label: 'Отправлен',   color: 'bg-purple-100 text-purple-700' },
  delivered:      { label: 'Доставлен',   color: 'bg-green-100 text-green-700' },
  cancelled:      { label: 'Отменён',     color: 'bg-gray-100 text-gray-500' },
  fraud_blocked:  { label: '🔒 Блок',     color: 'bg-red-100 text-red-700' },
}

const EMPTY_PRODUCT = {
  name: '', brand: 'Apple', category: '', model: '',
  price: '', stock: '', description: '', image_url: ''
}

const BRANDS = ['Apple', 'Samsung', 'Dyson', 'Яндекс']

export default function AdminPage() {
  const { user, isAuth } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState(0)

  // Products state
  const [products, setProducts] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [newProduct, setNewProduct] = useState(EMPTY_PRODUCT)
  const [prodSearch, setProdSearch] = useState('')
  const [saving, setSaving] = useState(false)

  // Other tabs state
  const [orders, setOrders] = useState([])
  const [users, setUsers] = useState([])
  const [promos, setPromos] = useState([])
  const [fraudLogs, setFraudLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [newPromo, setNewPromo] = useState({ code: '', discount_percent: 10, is_first_order_only: false, max_uses: '' })

  // Antifraud subtab + data
  const [antifraudSub, setAntifraudSub] = useState('events') // 'events' | 'rules' | 'metrics'
  const [rules, setRules] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [logsFilter, setLogsFilter] = useState({ phase: '', rule: '', decision: '', min_score: 0 })

  const fileInputRef = useRef(null)
  const editFileRef = useRef(null)

  useEffect(() => {
    if (!isAuth() || user?.role !== 'admin') { navigate('/'); return }
  }, [user])

  const loadAntifraud = async (sub = antifraudSub) => {
    if (sub === 'events') {
      const params = {}
      if (logsFilter.phase) params.phase = logsFilter.phase
      if (logsFilter.rule) params.rule = logsFilter.rule
      if (logsFilter.decision) params.decision = logsFilter.decision
      if (logsFilter.min_score) params.min_score = logsFilter.min_score
      const r = await adminAPI.fraudLogs(params)
      setFraudLogs(r.data)
    } else if (sub === 'rules') {
      const r = await adminAPI.rules()
      setRules(r.data)
    } else if (sub === 'metrics') {
      const r = await adminAPI.metrics()
      setMetrics(r.data)
    }
  }

  useEffect(() => {
    setLoading(true)
    const loaders = [
      () => api.get('/products?limit=100').then(r => setProducts(r.data)),
      () => api.get('/orders').then(r => setOrders(r.data)),
      () => api.get('/admin/users').then(r => setUsers(r.data)),
      () => api.get('/promo').then(r => setPromos(r.data)),
      () => loadAntifraud(antifraudSub),
    ]
    loaders[tab]().finally(() => setLoading(false))
  }, [tab, antifraudSub])

  const toggleRule = async (code, enabled) => {
    const r = await adminAPI.updateRule(code, { enabled })
    setRules(rs => rs.map(x => x.code === code ? r.data : x))
  }

  const updateRuleWeight = async (code, weight) => {
    const r = await adminAPI.updateRule(code, { score_weight: weight })
    setRules(rs => rs.map(x => x.code === code ? r.data : x))
  }

  const resetRules = async () => {
    if (!confirm('Сбросить все правила к дефолтам?')) return
    await adminAPI.resetRules()
    const r = await adminAPI.rules()
    setRules(r.data)
  }

  const resetAntifraudData = async () => {
    if (!confirm('Удалить все fraud_logs и сбросить автоблокировки? Это нужно перед новым прогоном BAS-теста.')) return
    await adminAPI.resetAntifraudData()
    if (antifraudSub === 'events') {
      const r = await adminAPI.fraudLogs()
      setFraudLogs(r.data)
    } else if (antifraudSub === 'metrics') {
      const r = await adminAPI.metrics()
      setMetrics(r.data)
    }
  }

  // ─── Image upload helper ───────────────────────────────────────
  const handleImageUpload = async (file, onSuccess) => {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const { data } = await api.post('/admin/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      onSuccess(data.url)
    } catch {
      // Fallback: используем локальный путь
      const localPath = `/images/${file.name}`
      onSuccess(localPath)
      alert(`Сервер загрузки недоступен.\nПоложи файл "${file.name}" в папку frontend/public/images/`)
    }
  }

  // ─── Products CRUD ─────────────────────────────────────────────
  const startEdit = (product) => {
    setEditingId(product.id)
    setEditForm({ ...product })
    setShowAddForm(false)
  }

  const cancelEdit = () => { setEditingId(null); setEditForm({}) }

  const saveEdit = async (id) => {
    setSaving(true)
    try {
      const { data } = await api.patch(`/products/${id}`, {
        name: editForm.name,
        brand: editForm.brand,
        category: editForm.category,
        model: editForm.model,
        price: Number(editForm.price),
        stock: Number(editForm.stock),
        description: editForm.description,
        image_url: editForm.image_url,
      })
      setProducts(p => p.map(x => x.id === id ? data : x))
      setEditingId(null)
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const deleteProduct = async (id) => {
    if (!confirm('Удалить товар?')) return
    await api.delete(`/products/${id}`)
    setProducts(p => p.filter(x => x.id !== id))
  }

  const createProduct = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await api.post('/products', {
        ...newProduct,
        price: Number(newProduct.price),
        stock: Number(newProduct.stock),
      })
      setProducts(p => [data, ...p])
      setNewProduct(EMPTY_PRODUCT)
      setShowAddForm(false)
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка создания')
    } finally {
      setSaving(false)
    }
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(prodSearch.toLowerCase()) ||
    p.brand.toLowerCase().includes(prodSearch.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(prodSearch.toLowerCase())
  )

  // ─── Other tab actions ─────────────────────────────────────────
  const blockUser = async (id, blocked) => {
    await api.patch(`/admin/users/${id}/${blocked ? 'unblock' : 'block'}`)
    setUsers(u => u.map(x => x.id === id ? { ...x, is_blocked: !blocked } : x))
  }

  const updateOrderStatus = async (id, status) => {
    await api.patch(`/orders/${id}/status`, { status })
    setOrders(o => o.map(x => x.id === id ? { ...x, status } : x))
  }

  const createPromo = async (e) => {
    e.preventDefault()
    const payload = { ...newPromo, discount_percent: Number(newPromo.discount_percent) }
    if (!newPromo.max_uses) delete payload.max_uses
    else payload.max_uses = Number(newPromo.max_uses)
    await api.post('/promo', payload)
    const r = await api.get('/promo')
    setPromos(r.data)
    setNewPromo({ code: '', discount_percent: 10, is_first_order_only: false, max_uses: '' })
  }

  const deactivatePromo = async (id) => {
    await api.patch(`/promo/${id}/deactivate`)
    setPromos(p => p.map(x => x.id === id ? { ...x, is_active: false } : x))
  }

  const parseJsonSafe = (value, fallback) => {
  if (!value) return fallback
  if (Array.isArray(value) || typeof value === 'object') return value

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const getFraudDecision = (action) => {
  const map = {
    approved: { label: 'Разрешён', color: 'bg-green-100 text-green-700' },
    review: { label: 'Проверка', color: 'bg-orange-100 text-orange-700' },
    blocked: { label: 'Заблокирован', color: 'bg-red-100 text-red-700' },
  }

  return map[action] || { label: action || '—', color: 'bg-gray-100 text-gray-600' }
}

const getRiskColor = (score) => {
  if (score >= 70) return 'bg-red-100 text-red-700'
  if (score >= 40) return 'bg-orange-100 text-orange-700'
  return 'bg-green-100 text-green-700'
}
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-brand-navy">Админ-панель</h1>
        <span className="badge bg-accent/10 text-accent">admin</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`flex-1 min-w-fit px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === i ? 'bg-white shadow text-brand-navy' : 'text-gray-500 hover:text-gray-700'
            }`}>{t}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="card h-14 animate-pulse bg-gray-100" />)}
        </div>
      ) : (
        <>
          {/* ── ТОВАРЫ ── */}
          {tab === 0 && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <input
                  className="input text-sm w-full sm:w-72"
                  placeholder="🔍 Поиск по названию, бренду..."
                  value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)}
                />
                <button
                  onClick={() => { setShowAddForm(v => !v); setEditingId(null) }}
                  className={`btn-primary text-sm shrink-0 ${showAddForm ? 'bg-gray-400 hover:bg-gray-500' : ''}`}
                >
                  {showAddForm ? '✕ Отмена' : '+ Добавить товар'}
                </button>
              </div>

              {/* Add form */}
              {showAddForm && (
                <form onSubmit={createProduct} className="card p-6 border-2 border-accent/20">
                  <h3 className="font-bold text-brand-navy mb-4">Новый товар</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Название *</label>
                      <input className="input text-sm" required placeholder="iPhone 17 Pro"
                        value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Бренд *</label>
                      <select className="input text-sm" value={newProduct.brand}
                        onChange={e => setNewProduct(p => ({ ...p, brand: e.target.value }))}>
                        {BRANDS.map(b => <option key={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Категория *</label>
                      <input className="input text-sm" required placeholder="iPhone"
                        value={newProduct.category} onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Модель</label>
                      <input className="input text-sm" placeholder="iPhone 17 Pro 256GB"
                        value={newProduct.model} onChange={e => setNewProduct(p => ({ ...p, model: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Цена ₽ *</label>
                      <input className="input text-sm" required type="number" min="0" placeholder="129990"
                        value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Остаток *</label>
                      <input className="input text-sm" required type="number" min="0" placeholder="10"
                        value={newProduct.stock} onChange={e => setNewProduct(p => ({ ...p, stock: e.target.value }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Описание</label>
                      <input className="input text-sm" placeholder="Краткое описание товара"
                        value={newProduct.description} onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Фото</label>
                      <div className="flex gap-2">
                        <input className="input text-sm flex-1" placeholder="/images/iphone.png"
                          value={newProduct.image_url} onChange={e => setNewProduct(p => ({ ...p, image_url: e.target.value }))} />
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                          className="btn-outline text-xs px-3 py-2 shrink-0">📁</button>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                          onChange={e => handleImageUpload(e.target.files[0], url => setNewProduct(p => ({ ...p, image_url: url })))} />
                      </div>
                      {newProduct.image_url && (
                        <img src={newProduct.image_url} alt="" className="mt-2 h-16 w-auto object-contain rounded-lg border" />
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" disabled={saving} className="btn-primary text-sm">
                      {saving ? 'Сохраняем...' : '✓ Создать товар'}
                    </button>
                    <button type="button" onClick={() => setShowAddForm(false)} className="btn-outline text-sm">
                      Отмена
                    </button>
                  </div>
                </form>
              )}

              {/* Products table */}
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <tr>
                        {['Фото', 'Название', 'Бренд', 'Цена ₽', 'Остаток', 'Действия'].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredProducts.map(p => (
                        editingId === p.id ? (
                          // ── Inline edit row ──
                          <tr key={p.id} className="bg-orange-50/40">
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                {editForm.image_url && (
                                  <img src={editForm.image_url} alt="" className="w-12 h-12 object-contain rounded" />
                                )}
                                <button type="button" onClick={() => editFileRef.current?.click()}
                                  className="text-xs text-accent hover:underline">📁 Фото</button>
                                <input ref={editFileRef} type="file" accept="image/*" className="hidden"
                                  onChange={e => handleImageUpload(e.target.files[0], url => setEditForm(f => ({ ...f, image_url: url })))} />
                                <input className="input text-xs w-28" placeholder="/images/..."
                                  value={editForm.image_url || ''} onChange={e => setEditForm(f => ({ ...f, image_url: e.target.value }))} />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <input className="input text-sm w-40 mb-1" value={editForm.name || ''}
                                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                              <input className="input text-xs w-40" placeholder="Модель"
                                value={editForm.model || ''} onChange={e => setEditForm(f => ({ ...f, model: e.target.value }))} />
                            </td>
                            <td className="px-4 py-3">
                              <select className="input text-sm w-28" value={editForm.brand || ''}
                                onChange={e => setEditForm(f => ({ ...f, brand: e.target.value }))}>
                                {BRANDS.map(b => <option key={b}>{b}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input className="input text-sm w-28" type="number" min="0"
                                value={editForm.price || ''} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} />
                            </td>
                            <td className="px-4 py-3">
                              <input className="input text-sm w-20" type="number" min="0"
                                value={editForm.stock || ''} onChange={e => setEditForm(f => ({ ...f, stock: e.target.value }))} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button onClick={() => saveEdit(p.id)} disabled={saving}
                                  className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600">
                                  {saving ? '...' : '✓ Сохранить'}
                                </button>
                                <button onClick={cancelEdit}
                                  className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                                  Отмена
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          // ── Normal row ──
                          <tr key={p.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3">
                              <img
                                src={p.image_url || '/images/17pro.png'}
                                alt={p.name}
                                className="w-12 h-12 object-contain"
                                onError={e => e.target.src = 'https://placehold.co/48x48?text=IMG'}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-800 line-clamp-1">{p.name}</p>
                              <p className="text-xs text-gray-400 line-clamp-1">{p.model}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="badge bg-gray-100 text-gray-600">{p.brand}</span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-brand-navy tabular-nums">
                              {p.price.toLocaleString('ru-RU')}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`badge font-semibold ${
                                p.stock === 0 ? 'bg-red-100 text-red-600' :
                                p.stock <= 5 ? 'bg-orange-100 text-orange-600' :
                                'bg-green-100 text-green-600'
                              }`}>{p.stock} шт.</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button onClick={() => startEdit(p)}
                                  className="text-xs border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                                  ✏️ Изменить
                                </button>
                                <button onClick={() => deleteProduct(p.id)}
                                  className="text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50">
                                  🗑
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
                  Всего: {filteredProducts.length} товаров
                </div>
              </div>
            </div>
          )}

          {/* ── ЗАКАЗЫ ── */}
          {tab === 1 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    {['#', 'Дата', 'Пользователь', 'Сумма', 'Статус', 'Действие'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map(o => {
                    const st = STATUS_MAP[o.status] || { label: o.status, color: 'bg-gray-100 text-gray-500' }
                    return (
                      <tr key={o.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-mono text-gray-400">#{o.id}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(o.created_at).toLocaleDateString('ru-RU')}</td>
                        <td className="px-4 py-3 text-gray-600">ID {o.user_id}</td>
                        <td className="px-4 py-3 font-semibold text-brand-navy">{o.final_price.toLocaleString('ru-RU')} ₽</td>
                        <td className="px-4 py-3"><span className={`badge ${st.color}`}>{st.label}</span></td>
                        <td className="px-4 py-3">
                          <select value={o.status} onChange={e => updateOrderStatus(o.id, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1">
                            {Object.entries(STATUS_MAP).map(([v, s]) => (
                              <option key={v} value={v}>{s.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── ПОЛЬЗОВАТЕЛИ ── */}
          {tab === 2 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    {['ID', 'Email', 'Имя', 'Роль', 'IP', 'Статус', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-400 font-mono">{u.id}</td>
                      <td className="px-4 py-3 text-gray-700">{u.email}</td>
                      <td className="px-4 py-3 text-gray-500">{u.full_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${u.role === 'admin' ? 'bg-accent/10 text-accent' : 'bg-gray-100 text-gray-500'}`}>{u.role}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{u.registered_ip || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${u.is_blocked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                          {u.is_blocked ? 'Заблокирован' : 'Активен'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => blockUser(u.id, u.is_blocked)}
                          className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                            u.is_blocked ? 'border-green-200 text-green-600 hover:bg-green-50' : 'border-red-200 text-red-500 hover:bg-red-50'
                          }`}>
                          {u.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── ПРОМОКОДЫ ── */}
          {tab === 3 && (
            <div className="space-y-6">
              <div className="card p-6">
                <h3 className="font-bold text-brand-navy mb-4">Создать промокод</h3>
                <form onSubmit={createPromo} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Код *</label>
                    <input className="input text-sm uppercase" required placeholder="PROMO20"
                      value={newPromo.code} onChange={e => setNewPromo(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Скидка % *</label>
                    <input className="input text-sm" type="number" min="1" max="100" required
                      value={newPromo.discount_percent} onChange={e => setNewPromo(p => ({ ...p, discount_percent: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Лимит использований</label>
                    <input className="input text-sm" type="number" placeholder="∞"
                      value={newPromo.max_uses} onChange={e => setNewPromo(p => ({ ...p, max_uses: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="first_only" checked={newPromo.is_first_order_only}
                      onChange={e => setNewPromo(p => ({ ...p, is_first_order_only: e.target.checked }))}
                      className="w-4 h-4 accent-orange-500" />
                    <label htmlFor="first_only" className="text-xs text-gray-600">Только 1-й заказ</label>
                  </div>
                  <button type="submit" className="btn-primary text-sm py-2">Создать</button>
                </form>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      {['Код', 'Скидка', 'Использований', 'Первый заказ', 'Статус', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {promos.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-mono font-bold text-brand-navy">{p.code}</td>
                        <td className="px-4 py-3 text-accent font-semibold">{p.discount_percent}%</td>
                        <td className="px-4 py-3 text-gray-500">{p.used_count} / {p.max_uses ?? '∞'}</td>
                        <td className="px-4 py-3">
                          {p.is_first_order_only
                            ? <span className="badge bg-orange-100 text-orange-700">Да</span>
                            : <span className="badge bg-gray-100 text-gray-400">Нет</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                            {p.is_active ? 'Активен' : 'Неактивен'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {p.is_active && (
                            <button onClick={() => deactivatePromo(p.id)}
                              className="text-xs text-red-400 hover:text-red-600 border border-red-200 px-2 py-1 rounded-lg">
                              Деактивировать
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── АНТИФРОД ── */}
          {tab === 4 && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-brand-navy">Антифрод</h2>
                  <p className="text-sm text-gray-500">
                    События, правила и метрики работы модуля.
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => loadAntifraud(antifraudSub)} className="btn-outline text-sm">Обновить</button>
                  <button onClick={resetAntifraudData} className="text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                    🗑 Сбросить данные
                  </button>
                </div>
              </div>

              {/* Sub tabs */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                {[
                  { id: 'events',  label: '📜 События' },
                  { id: 'rules',   label: '⚙️ Правила' },
                  { id: 'metrics', label: '📊 Метрики' },
                ].map(s => (
                  <button key={s.id} onClick={() => setAntifraudSub(s.id)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      antifraudSub === s.id ? 'bg-white shadow text-brand-navy' : 'text-gray-500 hover:text-gray-700'
                    }`}>{s.label}</button>
                ))}
              </div>

              {/* ── RULES ── */}
              {antifraudSub === 'rules' && (
                <div className="space-y-3">
                  

                  {['on_register','pre_payment','post_payment'].map(phase => (
                    <div key={phase} className="space-y-2">
                      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                        {phase === 'on_register' ? 'На регистрации' : phase === 'pre_payment' ? 'До оплаты' : 'После оплаты'}
                      </h3>
                      <div className="space-y-2">
                        {rules.filter(r => r.phase === phase).map(r => (
                          <div key={r.code} className={`card p-4 flex flex-col lg:flex-row lg:items-center gap-3 ${r.enabled ? '' : 'opacity-60'}`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <code className="text-sm font-bold text-brand-navy">{r.code}</code>
                                {!r.enabled && <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">disabled</span>}
                                {r.weight !== r.default_weight && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">override</span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mt-1">{r.description}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <label className="text-xs text-gray-500">Вес</label>
                              <input type="number" min={0} max={200}
                                value={r.weight}
                                onChange={e => updateRuleWeight(r.code, Number(e.target.value))}
                                className="input text-sm w-20 tabular-nums" />
                              <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={r.enabled}
                                  onChange={e => toggleRule(r.code, e.target.checked)}
                                  className="w-4 h-4 accent-orange-500" />
                                <span className="text-sm">enabled</span>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── METRICS ── */}
              {antifraudSub === 'metrics' && metrics && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="card p-4">
                      <div className="text-xs text-gray-400">Всего проверок</div>
                      <div className="text-2xl font-bold text-brand-navy">{metrics.total_logs}</div>
                    </div>
                    <div className="card p-4">
                      <div className="text-xs text-gray-400">Средний risk_score</div>
                      <div className="text-2xl font-bold text-brand-navy">{metrics.avg_score}</div>
                    </div>
                    <div className="card p-4">
                      <div className="text-xs text-gray-400">Заблокировано юзеров</div>
                      <div className="text-2xl font-bold text-red-600">{metrics.blocked_users}</div>
                    </div>
                    <div className="card p-4">
                      <div className="text-xs text-gray-400">Blocked / Review</div>
                      <div className="text-lg font-bold text-brand-navy">
                        {metrics.by_decision.blocked || 0} / {metrics.by_decision.review || 0}
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="card p-4">
                      <h4 className="font-semibold text-brand-navy mb-3">Распределение решений</h4>
                      <div className="space-y-2">
                        {Object.entries(metrics.by_decision).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm">
                            <span className="capitalize text-gray-600">{k}</span>
                            <b className="tabular-nums">{v}</b>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="card p-4">
                      <h4 className="font-semibold text-brand-navy mb-3">По фазам</h4>
                      <div className="space-y-2">
                        {Object.entries(metrics.by_phase).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm">
                            <span className="text-gray-600">{k}</span>
                            <b className="tabular-nums">{v}</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="card p-4">
                    <h4 className="font-semibold text-brand-navy mb-3">Сработавшие правила (всего)</h4>
                    {Object.keys(metrics.by_rule).length === 0 ? (
                      <p className="text-sm text-gray-500">Ни одно правило ещё не срабатывало</p>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(metrics.by_rule)
                          .sort((a, b) => b[1] - a[1])
                          .map(([code, count]) => (
                            <div key={code} className="flex justify-between text-sm">
                              <code className="text-gray-700">{code}</code>
                              <b className="tabular-nums">{count}</b>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── EVENTS ── */}
              {antifraudSub === 'events' && (
              <>
              <div className="card p-3 flex flex-wrap gap-2 items-center">
                <select value={logsFilter.phase} onChange={e => setLogsFilter(f => ({ ...f, phase: e.target.value }))}
                  className="input text-sm w-40">
                  <option value="">Все фазы</option>
                  <option value="on_register">on_register</option>
                  <option value="pre_payment">pre_payment</option>
                  <option value="post_payment_promo">post_payment</option>
                </select>
                <select value={logsFilter.decision} onChange={e => setLogsFilter(f => ({ ...f, decision: e.target.value }))}
                  className="input text-sm w-40">
                  <option value="">Все решения</option>
                  <option value="approved">approved</option>
                  <option value="review">review</option>
                  <option value="blocked">blocked</option>
                </select>
                <input className="input text-sm w-44" placeholder="Правило содержит..."
                  value={logsFilter.rule} onChange={e => setLogsFilter(f => ({ ...f, rule: e.target.value }))} />
                <input className="input text-sm w-28" type="number" placeholder="min score" min={0}
                  value={logsFilter.min_score} onChange={e => setLogsFilter(f => ({ ...f, min_score: e.target.value }))} />
                <button className="btn-outline text-sm" onClick={() => loadAntifraud('events')}>Применить</button>
              </div>

              {fraudLogs.length === 0 ? (
                <div className="card p-10 text-center">
                  <div className="text-4xl mb-3">🛡️</div>
                  <h3 className="text-lg font-semibold text-brand-navy mb-1">
                    Фрод-событий пока нет
                  </h3>
                  <p className="text-gray-500">
                    Здесь появятся результаты pre-payment и post-payment проверок.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {fraudLogs.map(log => {
                    const rules = parseJsonSafe(log.triggered_rules, [])
                    const details = parseJsonSafe(log.details, {})
                    const decision = getFraudDecision(log.action_taken)

                    return (
                      <div key={log.id} className="card p-5">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm text-gray-400">Событие #{log.id}</span>

                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRiskColor(log.risk_score)}`}>
                                Risk Score: {log.risk_score}
                              </span>

                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${decision.color}`}>
                                {decision.label}
                              </span>
                            </div>

                            <div className="text-sm text-gray-600">
                              Заказ: <b>#{log.order_id || '—'}</b>
                              {' · '}
                              Пользователь: <b>{log.user_email || `ID ${log.user_id}`}</b>
                              {' · '}
                              Статус заказа: <b>{log.order_status || '—'}</b>
                            </div>

                            <div className="text-sm text-gray-600">
                              Сумма: <b>{log.order_sum ? `${Number(log.order_sum).toLocaleString('ru-RU')} ₽` : '—'}</b>
                              {' · '}
                              Оплата: <b>{log.payment_method || '—'}</b>
                              {' · '}
                              Статус оплаты: <b>{log.payment_status || '—'}</b>
                            </div>

                            <div className="text-xs text-gray-400">
                              {log.created_at ? new Date(log.created_at).toLocaleString('ru-RU') : '—'}
                            </div>
                          </div>

                          <div className="text-sm text-gray-600 lg:text-right">
                            <div>Телефон: <b>{log.recipient_phone || '—'}</b></div>
                            <div>IP: <b>{log.ip || '—'}</b></div>
                            <div>
                              Карта:{' '}
                              <b>
                                {log.card_first6 && log.card_last4
                                  ? `${log.card_first6}******${log.card_last4}`
                                  : '—'}
                              </b>
                            </div>
                            <div>Тип карты: <b>{log.card_type || '—'}</b></div>
                          </div>
                        </div>

                        <div className="mt-4 grid lg:grid-cols-2 gap-4">
                          <div className="rounded-xl bg-gray-50 p-4">
                            <h4 className="text-sm font-semibold text-brand-navy mb-2">
                              Сработавшие правила
                            </h4>

                            {rules.length === 0 ? (
                              <p className="text-sm text-gray-500">Правила не сработали</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {rules.map(rule => (
                                  <span
                                    key={rule}
                                    className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs text-gray-700"
                                  >
                                    {rule}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="rounded-xl bg-gray-50 p-4">
                            <h4 className="text-sm font-semibold text-brand-navy mb-2">
                              Детали проверки
                            </h4>

                            <div className="space-y-1 text-xs text-gray-600">
                              {Object.keys(details).length === 0 ? (
                                <p>Нет дополнительных данных</p>
                              ) : (
                                Object.entries(details).map(([key, value]) => (
                                  <div key={key} className="flex justify-between gap-3">
                                    <span>{key}</span>
                                    <b>{typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}</b>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        {log.device_fingerprint && (
                          <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                            <div className="text-xs text-gray-400 mb-1">Device fingerprint</div>
                            <div className="text-xs text-gray-600 break-all">
                              {log.device_fingerprint}
                            </div>
                          </div>
                        )}

                        {log.delivery_address && (
                          <div className="mt-3 text-sm text-gray-500">
                            Адрес доставки: {log.delivery_address}
                          </div>
                        )}

                        {log.refund_note && (
                          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3">
                            <div className="text-xs font-semibold text-red-600 mb-1">Уведомление о возврате</div>
                            <div className="text-xs text-red-500">{log.refund_note}</div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}