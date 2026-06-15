import api from './client'

// ─── Auth ────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login', data),
  me:       ()     => api.get('/auth/me'),
  update:   (data) => api.patch('/auth/me', data),
}

// ─── Products ────────────────────────────────────────────────────
export const productsAPI = {
  list:       (params) => api.get('/products', { params }),
  get:        (id)     => api.get(`/products/${id}`),
  brands:     ()       => api.get('/products/brands'),
  categories: (brand)  => api.get('/products/categories', { params: { brand } }),
}

// ─── Cart ────────────────────────────────────────────────────────
export const cartAPI = {
  get:    ()           => api.get('/cart'),
  add:    (data)       => api.post('/cart/add', data),
  update: (id, qty)    => api.patch(`/cart/${id}`, { quantity: qty }),
  remove: (id)         => api.delete(`/cart/${id}`),
  clear:  ()           => api.delete('/cart'),
}

// ─── Orders ──────────────────────────────────────────────────────
export const ordersAPI = {
  create: (data) => api.post('/orders', data),
  my:     ()     => api.get('/orders/my'),
  get:    (id)   => api.get(`/orders/my/${id}`),
}

export const paymentsAPI = {
  create: (orderId) => api.post(`/payments/create/${orderId}`),
  sync: (orderId) => api.post(`/payments/sync/${orderId}`),
}

// ─── Promo ───────────────────────────────────────────────────────
export const promoAPI = {
  apply: (code, cart_total) => api.post('/promo/apply', { code, cart_total }),
}

// ─── Admin / Antifraud ───────────────────────────────────────────
export const adminAPI = {
  fraudLogs: (params) => api.get('/admin/fraud-logs', { params }),
  rules: () => api.get('/admin/antifraud/rules'),
  updateRule: (code, body) => api.patch(`/admin/antifraud/rules/${code}`, body),
  resetRules: () => api.post('/admin/antifraud/rules/reset'),
  metrics: () => api.get('/admin/antifraud/metrics'),
  resetAntifraudData: () => api.post('/admin/antifraud/reset-data'),
}
