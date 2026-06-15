import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { productsAPI } from '../api'
import ProductCard from '../components/ui/ProductCard'

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [products, setProducts] = useState([])
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)

  const brand    = searchParams.get('brand') || ''
  const category = searchParams.get('category') || ''
  const search   = searchParams.get('search') || ''
  const minPrice = searchParams.get('min_price') || ''
  const maxPrice = searchParams.get('max_price') || ''

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (brand)    params.brand    = brand
      if (category) params.category = category
      if (search)   params.search   = search
      if (minPrice) params.min_price = minPrice
      if (maxPrice) params.max_price = maxPrice
      const { data } = await productsAPI.list(params)
      setProducts(data)
    } finally {
      setLoading(false)
    }
  }, [brand, category, search, minPrice, maxPrice])

  useEffect(() => {
    productsAPI.brands().then(({ data }) => setBrands(data))
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'brand') next.delete('category')
    setSearchParams(next)
  }

  const clearFilters = () => setSearchParams({})

  const BRAND_ICONS = {
    Apple: '🍎', Dyson: '💨', Samsung: '📱', Яндекс: '🔊',
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-brand-navy mb-6">Каталог товаров</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar — Filters */}
        <aside className="lg:w-60 shrink-0">
          <div className="card p-5 sticky top-20">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-brand-navy">Фильтры</span>
              {(brand || category || search || minPrice || maxPrice) && (
                <button onClick={clearFilters} className="text-xs text-accent hover:underline">
                  Сбросить
                </button>
              )}
            </div>

            {/* Search */}
            <div className="mb-5">
              <label className="text-xs text-gray-500 font-medium mb-2 block">Поиск</label>
              <input
                className="input text-sm"
                placeholder="Название товара..."
                value={search}
                onChange={(e) => setParam('search', e.target.value)}
              />
            </div>

            {/* Brands */}
            <div className="mb-5">
              <label className="text-xs text-gray-500 font-medium mb-2 block">Бренд</label>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setParam('brand', '')}
                  className={`text-left text-sm px-3 py-2 rounded-lg transition-colors ${!brand ? 'bg-accent text-white font-medium' : 'hover:bg-gray-100'}`}
                >
                  Все бренды
                </button>
                {brands.map((b) => (
                  <button
                    key={b}
                    onClick={() => setParam('brand', b)}
                    className={`text-left text-sm px-3 py-2 rounded-lg transition-colors ${brand === b ? 'bg-accent text-white font-medium' : 'hover:bg-gray-100'}`}
                  >
                    {BRAND_ICONS[b] || ''} {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Price */}
            <div>
              <label className="text-xs text-gray-500 font-medium mb-2 block">Цена, ₽</label>
              <div className="flex gap-2">
                <input
                  className="input text-sm w-full"
                  placeholder="от"
                  type="number"
                  value={minPrice}
                  onChange={(e) => setParam('min_price', e.target.value)}
                />
                <input
                  className="input text-sm w-full"
                  placeholder="до"
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setParam('max_price', e.target.value)}
                />
              </div>
            </div>
          </div>
        </aside>

        {/* Products Grid */}
        <div className="flex-1">
          {/* Active filters */}
          {(brand || category) && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {brand && (
                <span className="badge bg-accent/10 text-accent">
                  {brand}
                  <button onClick={() => setParam('brand', '')} className="ml-1 hover:text-red-500">×</button>
                </span>
              )}
              {category && (
                <span className="badge bg-brand-navy/10 text-brand-navy">
                  {category}
                  <button onClick={() => setParam('category', '')} className="ml-1 hover:text-red-500">×</button>
                </span>
              )}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card animate-pulse">
                  <div className="bg-gray-100 h-52 rounded-t-2xl" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-6xl mb-4">🔍</div>
              <p className="font-medium">Товары не найдены</p>
              <p className="text-sm mt-2">Попробуйте изменить фильтры</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-4">{products.length} товаров</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {products.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
