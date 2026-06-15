import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useCartStore from '../store/useCartStore'
import useAuthStore from '../store/useAuthStore'
import { promoAPI } from '../api'

export default function CartPage() {
  const { items, total, loading, fetchCart, updateItem, removeItem, applyPromo, removePromo, promoCode, promoDiscount, finalTotal } = useCartStore()
  const { isAuth } = useAuthStore()
  const navigate = useNavigate()
  const [promoInput, setPromoInput] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoMsg, setPromoMsg] = useState(null)
  const promoInputRef = useRef(null)

  useEffect(() => {
    if (!isAuth()) { navigate('/login'); return }
    fetchCart()
  }, [])

  const handleApplyPromo = async () => {
    const code = (promoInputRef.current?.value || promoInput).trim()
    if (!code) return
    setPromoLoading(true)
    setPromoMsg(null)
    try {
      const { data } = await promoAPI.apply(code, total)
      if (data.valid) {
        applyPromo(code.toUpperCase(), data.discount_amount)
        setPromoMsg({ type: 'success', text: data.message })
      } else {
        setPromoMsg({ type: 'error', text: data.message })
      }
    } catch {
      setPromoMsg({ type: 'error', text: 'Промокод не найден' })
    } finally {
      setPromoLoading(false)
    }
  }

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="animate-pulse space-y-4">
        {[1,2,3].map(i => <div key={i} className="card h-24 bg-gray-100" />)}
      </div>
    </div>
  )

  if (items.length === 0) return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center">
      <div className="text-7xl mb-4">🛒</div>
      <h2 className="text-xl font-bold text-brand-navy mb-2">Корзина пуста</h2>
      <p className="text-gray-400 mb-8">Добавьте товары из каталога</p>
      <Link to="/catalog" className="btn-primary">Перейти в каталог</Link>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-brand-navy mb-8">Корзина</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="card p-4 flex items-center gap-4">
              <img
                src={item.product.image_url || '/images/17pro.png'}
                alt={item.product.name}
                className="w-16 h-16 object-contain shrink-0"
              />
              <div className="flex-1 min-w-0">
                <Link to={`/product/${item.product_id}`} className="font-semibold text-sm text-brand-navy hover:text-accent line-clamp-1">
                  {item.product.name}
                </Link>
                <p className="text-xs text-gray-400 mt-0.5">{item.product.model}</p>
                <p className="text-accent font-bold text-sm mt-1">
                  {(item.product.price * item.quantity).toLocaleString('ru-RU')} ₽
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-sm">
                  <button onClick={() => item.quantity > 1 ? updateItem(item.id, item.quantity - 1) : removeItem(item.id)}
                    className="px-2.5 py-1.5 hover:bg-gray-50 font-bold text-gray-500">−</button>
                  <span className="px-3 py-1.5 font-semibold">{item.quantity}</span>
                  <button onClick={() => updateItem(item.id, item.quantity + 1)}
                    className="px-2.5 py-1.5 hover:bg-gray-50 font-bold text-gray-500">+</button>
                </div>
                <button onClick={() => removeItem(item.id)}
                  className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="card p-6 h-fit sticky top-20">
          <h3 className="font-bold text-brand-navy mb-4">Итого</h3>

          {/* Promo */}
          {!promoCode ? (
            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-1.5 block font-medium">Промокод</label>
              <div className="flex gap-2">
                <input
                  ref={promoInputRef}
                  className="input text-sm flex-1"
                  placeholder="Введите код"
                  value={promoInput}
                  onChange={e => setPromoInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleApplyPromo()}
                />
                <button onClick={handleApplyPromo} disabled={promoLoading}
                  className="btn-navy text-sm px-4 py-2">
                  {promoLoading ? '...' : 'OK'}
                </button>
              </div>
              {promoMsg && (
                <p className={`text-xs mt-1.5 ${promoMsg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                  {promoMsg.text}
                </p>
              )}
            </div>
          ) : (
            <div className="mb-4 flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2">
              <span className="text-xs text-green-700 font-semibold">✓ {promoCode}</span>
              <button onClick={() => { removePromo(); setPromoMsg(null); setPromoInput('') }}
                className="text-xs text-gray-400 hover:text-red-400">Убрать</button>
            </div>
          )}

          <div className="space-y-2 text-sm border-t border-gray-100 pt-4">
            <div className="flex justify-between text-gray-500">
              <span>Товары</span>
              <span>{total.toLocaleString('ru-RU')} ₽</span>
            </div>
            {promoDiscount > 0 && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>Скидка</span>
                <span>−{promoDiscount.toLocaleString('ru-RU')} ₽</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-brand-navy text-base pt-2 border-t border-gray-100">
              <span>К оплате</span>
              <span>{finalTotal().toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>

          <button onClick={() => navigate('/checkout')} className="btn-primary w-full mt-6 text-center">
            Оформить заказ
          </button>
        </div>
      </div>
    </div>
  )
}
