import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useCartStore from '../store/useCartStore'
import useAuthStore, { buildOrderSignals } from '../store/useAuthStore'
import { ordersAPI, paymentsAPI } from '../api'
import { useBehaviorTracker } from '../lib/behavior'

export default function CheckoutPage() {
  const { items, total, promoCode, promoDiscount, finalTotal, clearCart } = useCartStore()
  const { user, isAuth } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const behaviorRef = useBehaviorTracker()
  const deliveryAddressRef = useRef(null)

const [form, setForm] = useState({
  recipient_name: '',
  recipient_phone: '',
  delivery_city: 'Новосибирск',
  delivery_address: '',
  payment_method: 'card',
})

  useEffect(() => {
    if (!isAuth()) { navigate('/login'); return }
    if (items.length === 0) { navigate('/cart'); return }
    if (user) {
      setForm(f => ({
        ...f,
        recipient_name: user.full_name || '',
        recipient_phone: user.phone || '',
      }))
    }
  }, [user, items])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
  e.preventDefault()
  // currentTarget обнуляется после первого await — захватываем до него
  const els = e.currentTarget.elements
  const domVal = (name) => els.namedItem(name)?.value ?? ''
  setLoading(true)
  setError(null)

  try {
    const behaviorSnapshot = behaviorRef.current.snapshot()
    const signals = await buildOrderSignals(behaviorSnapshot)
    const domForm = {
      recipient_name:  domVal('recipient_name')  || form.recipient_name,
      recipient_phone: domVal('recipient_phone') || form.recipient_phone,
      delivery_city:   domVal('delivery_city')   || form.delivery_city,
      delivery_address: deliveryAddressRef.current?.value || domVal('delivery_address') || form.delivery_address,
      payment_method:  form.payment_method,
    }

    const payload = {
      ...domForm,
      promo_code: promoCode || null,
      ...signals,
    }

    const { data } = await ordersAPI.create(payload)

    if (data.status === 'fraud_blocked') {
      clearCart()
      navigate(`/orders/${data.id}?fraud_blocked=1`)
      return
    }

    if (data.status === 'pending_review') {
      clearCart()
      navigate(`/orders/${data.id}?review=1`)
      return
    }

    if (payload.payment_method === 'cash') {
      clearCart()
      navigate(`/orders/${data.id}?success=1`)
      return
    }

    const paymentResponse = await paymentsAPI.create(data.id)

    if (paymentResponse.data.payment_url) {
      window.location.href = paymentResponse.data.payment_url
    } else {
      navigate(`/orders/${data.id}?success=1`)
    }
  } catch (err) {
    console.error('ORDER ERROR:', err.response?.data || err)

    const detail = err.response?.data?.detail
    const message = Array.isArray(detail)
      ? detail.map(item => item.msg).join(', ')
      : typeof detail === 'string'
        ? detail
        : 'Ошибка при создании заказа'

    setError(message)
  } finally {
    setLoading(false)
  }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-brand-navy mb-8">Оформление заказа</h1>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recipient */}
          <div className="card p-6">
            <h2 className="font-bold text-brand-navy mb-4">Получатель</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Имя и фамилия *</label>
                <input className="input" name="recipient_name" required value={form.recipient_name}
                  onChange={e => set('recipient_name', e.target.value)} placeholder="Иван Иванов" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Телефон *</label>
                <input className="input" name="recipient_phone" required value={form.recipient_phone}
                  onChange={e => set('recipient_phone', e.target.value)} placeholder="+7 999 999 99 99" />
              </div>
            </div>
          </div>

          {/* Delivery */}
          <div className="card p-6">
            <h2 className="font-bold text-brand-navy mb-4">Доставка / Самовывоз</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Город</label>
                <input className="input" name="delivery_city" value={form.delivery_city}
                  onChange={e => set('delivery_city', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Адрес доставки</label>
                <input className="input" name="delivery_address" ref={deliveryAddressRef}
                  defaultValue={form.delivery_address}
                  onChange={e => set('delivery_address', e.target.value)}
                  placeholder="ул. Гоголя, 38 или самовывоз" />
              </div>
            </div>
            <div className="mt-3 bg-brand-navy/5 rounded-xl p-3 text-xs text-gray-500">
              📍 Самовывоз: г. Новосибирск, ул. Гоголя, 38, ТЦ Маршал, Цокольный этаж, ежедневно 11:00–20:00
            </div>
          </div>

          {/* Payment */}
          <div className="card p-6">
            <h2 className="font-bold text-brand-navy mb-4">Оплата</h2>
            <div className="flex gap-3 mb-4">
              {[
                { value: 'card', label: '💳 Картой онлайн' },
                { value: 'cash', label: '💵 Наличными' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('payment_method', opt.value)}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    form.payment_method === opt.value
                      ? 'border-accent bg-accent/5 text-accent'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {form.payment_method === 'card' && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
                Оплата банковской картой проходит через защищённую страницу YooKassa.
                Данные карты не вводятся и не хранятся на нашем сайте.
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="card p-6 h-fit sticky top-20">
          <h3 className="font-bold text-brand-navy mb-4">Ваш заказ</h3>
          <div className="space-y-3 mb-4">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <img src={item.product.image_url || '/images/17pro.png'} alt=""
                  className="w-10 h-10 object-contain shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="line-clamp-1 text-gray-700">{item.product.name}</p>
                  <p className="text-gray-400 text-xs">{item.quantity} шт.</p>
                </div>
                <span className="font-semibold shrink-0">
                  {(item.product.price * item.quantity).toLocaleString('ru-RU')} ₽
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Товары</span><span>{total.toLocaleString('ru-RU')} ₽</span>
            </div>
            {promoDiscount > 0 && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>Промокод {promoCode}</span>
                <span>−{promoDiscount.toLocaleString('ru-RU')} ₽</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-brand-navy text-base pt-2 border-t border-gray-100">
              <span>Итого</span>
              <span>{finalTotal().toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full mt-6">
            {loading ? 'Оформляем...' : 'Подтвердить заказ'}
          </button>
        </div>
      </form>
    </div>
  )
}
