import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ordersAPI } from '../api'
import useAuthStore from '../store/useAuthStore'

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

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const { isAuth } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuth()) { navigate('/login'); return }
    ordersAPI.my()
      .then(({ data }) => setOrders(data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-4">
      {[1,2,3].map(i => <div key={i} className="card h-32 animate-pulse bg-gray-100" />)}
    </div>
  )

  if (orders.length === 0) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <div className="text-7xl mb-4">📦</div>
      <h2 className="text-xl font-bold text-brand-navy mb-2">Заказов пока нет</h2>
      <p className="text-gray-400 mb-8">Оформите первый заказ в нашем каталоге</p>
      <Link to="/catalog" className="btn-primary">Перейти в каталог</Link>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-brand-navy mb-8">Мои заказы</h1>
      <div className="space-y-4">
        {orders.map(order => {
          const st = STATUS_MAP[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-500' }
          return (
            <Link key={order.id} to={`/orders/${order.id}`} className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-md transition-shadow">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-bold text-brand-navy">Заказ #{order.id}</span>
                  <span className={`badge ${st.color}`}>{st.label}</span>
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(order.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-500 mt-1">{order.items.length} {order.items.length === 1 ? 'товар' : 'товара'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-brand-navy text-lg">{order.final_price.toLocaleString('ru-RU')} ₽</p>
                {order.discount_amount > 0 && (
                  <p className="text-xs text-green-600">−{order.discount_amount.toLocaleString('ru-RU')} ₽ скидка</p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
