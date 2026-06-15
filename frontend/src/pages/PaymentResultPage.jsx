import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { paymentsAPI } from '../api'

export default function PaymentResultPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const orderId = searchParams.get('order_id')

  const [message, setMessage] = useState('Проверяем статус оплаты...')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    const syncPayment = async () => {
      if (!orderId) {
        setIsError(true)
        setMessage('Не найден номер заказа.')
        return
      }

      const MAX_ATTEMPTS = 6
      const DELAY_MS = 2000

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const { data } = await paymentsAPI.sync(orderId)

          if (data.is_paid || data.payment_status === 'succeeded') {
            setMessage('Оплата прошла успешно. Заказ обновлён.')
            setTimeout(() => {
              navigate(`/orders/${orderId}?paid=1`)
            }, 1500)
            return
          }

          if (attempt < MAX_ATTEMPTS) {
            setMessage(`Ожидаем подтверждения оплаты... (${attempt}/${MAX_ATTEMPTS})`)
            await new Promise(resolve => setTimeout(resolve, DELAY_MS))
          } else {
            setMessage(`Оплата пока не подтверждена. Статус: ${data.payment_status}`)
          }
        } catch (err) {
          console.error(err)
          setIsError(true)
          setMessage('Не удалось проверить оплату. Попробуйте открыть заказ позже.')
          return
        }
      }
    }

    syncPayment()
  }, [orderId, navigate])

  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="card p-8">
        <h1 className="text-3xl font-bold mb-4">
          {isError ? 'Ошибка проверки оплаты' : 'Проверка оплаты'}
        </h1>

        <p className="text-gray-600 mb-6">{message}</p>

        {orderId && (
          <Link to={`/orders/${orderId}`} className="btn-primary inline-block">
            Перейти к заказу
          </Link>
        )}
      </div>
    </div>
  )
}