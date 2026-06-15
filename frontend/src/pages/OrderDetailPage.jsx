import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { ordersAPI, paymentsAPI } from '../api'

const STATUS_MAP = {
  pending:        { label: 'Ожидает оплаты',   color: 'bg-yellow-100 text-yellow-700' },
  pending_review: { label: 'На проверке',       color: 'bg-orange-100 text-orange-700' },
  paid:           { label: 'Оплачен',           color: 'bg-blue-100 text-blue-700' },
  processing:     { label: 'В обработке',       color: 'bg-blue-100 text-blue-700' },
  shipped:        { label: 'Отправлен',         color: 'bg-purple-100 text-purple-700' },
  delivered:      { label: 'Доставлен',         color: 'bg-green-100 text-green-700' },
  cancelled:      { label: 'Отменён',           color: 'bg-gray-100 text-gray-500' },
  fraud_blocked:  { label: '🔒 Заблокирован',   color: 'bg-red-100 text-red-700' },
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isSuccess = searchParams.get('success') === '1'
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    ordersAPI.get(id).then(({ data }) => {
      setOrder(data)
      // Auto-sync if payment exists but order is still pending (e.g. wallet payment)
      if (data.payment_id && data.status === 'pending' && !data.is_paid) {
        setSyncing(true)
        paymentsAPI.sync(id)
          .then(({ data: syncData }) => {
            if (syncData.is_paid || syncData.payment_status === 'succeeded') {
              return ordersAPI.get(id).then(({ data: fresh }) => setOrder(fresh))
            }
          })
          .catch(() => {})
          .finally(() => setSyncing(false))
      }
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400">Загрузка...</div>
  if (!order) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400">Заказ не найден</div>


  const st = STATUS_MAP[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-500' }


  const handlePayment = async () => {
  try {
    const { data } = await paymentsAPI.create(order.id)

    if (data.payment_url) {
      window.location.href = data.payment_url
    }
  } catch (err) {
    alert('Не удалось создать оплату. Попробуйте позже.')
  }
  }
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {syncing && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center mb-4 text-sm text-blue-600">
          Проверяем статус оплаты...
        </div>
      )}

      {isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center mb-8">
          <div className="text-5xl mb-3">🎉</div>
          <h2 className="text-xl font-bold text-green-700 mb-1">Заказ оформлен!</h2>
          <p className="text-green-600 text-sm">Мы свяжемся с вами в ближайшее время</p>
        </div>
      )}

      {order.status === 'fraud_blocked' && order.refund_note && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
          <p className="text-sm font-semibold text-red-700 mb-1">Заказ заблокирован</p>
          <p className="text-sm text-red-600">{order.refund_note}</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Заказ #{order.id}</h1>
        <span className={`badge ${st.color} text-sm px-3 py-1`}>{st.label}</span>
      </div>

      {/* Items */}
      <div className="card p-5 mb-4">
        <h3 className="font-semibold text-brand-navy mb-4">Товары</h3>
        <div className="space-y-3">
          {order.items.map(item => (
            <div key={item.id} className="flex items-center gap-4">
              <img src={item.product.image_url || '/images/17pro.png'} alt=""
                className="w-12 h-12 object-contain shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 line-clamp-1">{item.product.name}</p>
                <p className="text-xs text-gray-400">{item.quantity} шт. × {item.price.toLocaleString('ru-RU')} ₽</p>
              </div>
              <span className="font-semibold text-sm shrink-0">
                {(item.price * item.quantity).toLocaleString('ru-RU')} ₽
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 mt-4 pt-4 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Товары</span><span>{order.total_price.toLocaleString('ru-RU')} ₽</span>
          </div>
          {order.discount_amount > 0 && (
            <div className="flex justify-between text-green-600 font-medium">
              <span>Скидка</span><span>−{order.discount_amount.toLocaleString('ru-RU')} ₽</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-brand-navy text-base pt-1">
            <span>Итого</span><span>{order.final_price.toLocaleString('ru-RU')} ₽</span>
          </div>
        </div>
      </div>

      {/* Delivery */}
      {(order.delivery_address || order.recipient_name) && (
        <div className="card p-5 mb-4">
          <h3 className="font-semibold text-brand-navy mb-3">Доставка</h3>
          <div className="text-sm text-gray-600 space-y-1">
            {order.recipient_name && <p><span className="text-gray-400">Получатель:</span> {order.recipient_name}</p>}
            {order.recipient_phone && <p><span className="text-gray-400">Телефон:</span> {order.recipient_phone}</p>}
            {order.delivery_address && <p><span className="text-gray-400">Адрес:</span> {order.delivery_city}, {order.delivery_address}</p>}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Link to="/orders" className="btn-outline flex-1 text-center">← Все заказы</Link>

        {order.status !== 'paid' && !order.is_paid && (
          <button onClick={handlePayment} className="btn-primary flex-1">
            Оплатить онлайн
          </button>
        )}
      </div>
    </div>
  )
}
