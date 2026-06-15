import { Link, useNavigate } from 'react-router-dom'
import useCartStore from '../../store/useCartStore'
import useAuthStore from '../../store/useAuthStore'
import { useState } from 'react'

export default function ProductCard({ product }) {
  const { addItem, items } = useCartStore()
  const { isAuth } = useAuthStore()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)

  const inCart = items.some(item => item.product_id === product.id)

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!isAuth()) { navigate('/login'); return }
    if (inCart) { navigate('/cart'); return }
    setAdding(true)
    await addItem(product.id)
    setAdding(false)
  }

  return (
    <Link to={`/product/${product.id}`} className="bg-white rounded-3xl p-4 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col group border border-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs text-[#FF4400] font-semibold uppercase tracking-wide">{product.brand}</span>
          <h3 className="text-lg font-semibold text-[#071456] tracking-tight line-clamp-2 mt-1">{product.name}</h3>
        </div>
        {product.stock > 0 && product.stock <= 5 && <span className="text-[10px] bg-orange-50 text-[#FF4400] rounded-full px-2 py-1 whitespace-nowrap">{product.stock} шт.</span>}
      </div>

      <div className="w-8 h-[2px] bg-[#ff4400] mt-3 mb-4" />
      <div className="bg-neutral-50 rounded-2xl h-[220px] flex items-center justify-center p-4 overflow-hidden">
        <img src={product.image_url || '/images/17pro.png'} alt={product.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" loading="lazy" />
      </div>

      <div className="mt-4 flex flex-col flex-1">
        {product.model && <p className="text-sm text-gray-500 line-clamp-1 mb-3">{product.model}</p>}
        <div className="mt-auto flex items-center justify-between gap-3">
          <span className="text-xl font-semibold text-[#071456] whitespace-nowrap">{product.price.toLocaleString('ru-RU')} ₽</span>
          <button onClick={handleAdd} disabled={adding || product.stock === 0}
            className={`text-xs font-semibold px-4 py-2.5 rounded-full transition-all duration-200 active:scale-95 ${
              product.stock === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : inCart ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-[#FF4400] hover:bg-[#e63d00] text-white'
            }`}>
            {adding ? '...' : product.stock === 0 ? 'Нет' : inCart ? '✓' : 'В корзину'}
          </button>
        </div>
      </div>
    </Link>
  )
}
