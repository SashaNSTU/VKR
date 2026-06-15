import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { productsAPI } from '../api'
import useCartStore from '../store/useCartStore'
import useAuthStore from '../store/useAuthStore'

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const { addItem } = useCartStore()
  const { isAuth } = useAuthStore()

  useEffect(() => {
    productsAPI.get(id)
      .then(({ data }) => setProduct(data))
      .catch(() => navigate('/catalog'))
      .finally(() => setLoading(false))
  }, [id])

  const handleAdd = async () => {
    if (!isAuth()) { navigate('/login'); return }
    setAdding(true)
    await addItem(product.id, qty)
    setAdding(false)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-12 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="bg-gray-100 rounded-2xl h-96" />
        <div className="space-y-4">
          <div className="h-6 bg-gray-100 rounded w-1/4" />
          <div className="h-8 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-10 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
    </div>
  )

  if (!product) return null

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400 mb-8 flex items-center gap-2">
        <button onClick={() => navigate('/catalog')} className="hover:text-accent transition-colors">
          Каталог
        </button>
        <span>/</span>
        <span className="text-gray-600">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Image */}
        <div className="card p-8 flex items-center justify-center bg-gray-50">
          <img
            src={product.image_url || '/images/17pro.png'}
            alt={product.name}
            className="max-h-80 w-auto object-contain"
          />
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <span className="text-accent font-semibold text-sm uppercase tracking-wide mb-2">
            {product.brand}
          </span>
          <h1 className="text-2xl font-bold text-brand-navy mb-1">{product.name}</h1>
          {product.model && (
            <p className="text-gray-400 text-sm mb-4">{product.model}</p>
          )}
          {product.description && (
            <p className="text-gray-600 text-sm leading-relaxed mb-6">{product.description}</p>
          )}

          <div className="text-3xl font-bold text-brand-navy mb-6">
            {product.price.toLocaleString('ru-RU')} ₽
          </div>

          {/* Stock */}
          <div className="mb-6">
            {product.stock > 10 ? (
              <span className="badge bg-green-100 text-green-700">✓ В наличии</span>
            ) : product.stock > 0 ? (
              <span className="badge bg-orange-100 text-orange-700">⚠ Осталось {product.stock} шт.</span>
            ) : (
              <span className="badge bg-red-100 text-red-700">✗ Нет в наличии</span>
            )}
          </div>

          {/* Quantity + Add */}
          {product.stock > 0 && (
            <div className="flex items-center gap-4">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="px-4 py-3 hover:bg-gray-50 transition-colors font-bold text-gray-600"
                >−</button>
                <span className="px-4 py-3 font-semibold text-brand-navy min-w-[48px] text-center">
                  {qty}
                </span>
                <button
                  onClick={() => setQty(q => Math.min(product.stock, q + 1))}
                  className="px-4 py-3 hover:bg-gray-50 transition-colors font-bold text-gray-600"
                >+</button>
              </div>
              <button
                onClick={handleAdd}
                disabled={adding}
                className={`btn-primary flex-1 ${added ? 'bg-green-500 hover:bg-green-500' : ''}`}
              >
                {added ? '✓ Добавлено в корзину' : adding ? 'Добавляем...' : 'В корзину'}
              </button>
            </div>
          )}

          {added && (
            <button
              onClick={() => navigate('/cart')}
              className="mt-3 text-sm text-accent hover:underline text-center"
            >
              Перейти в корзину →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
