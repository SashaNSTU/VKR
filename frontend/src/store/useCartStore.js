import { create } from 'zustand'
import { cartAPI } from '../api'

const useCartStore = create((set, get) => ({
  items: [],
  total: 0,
  itemsCount: 0,
  loading: false,
  promoCode: null,
  promoDiscount: 0,

  fetchCart: async () => {
    set({ loading: true })
    try {
      const { data } = await cartAPI.get()
      set({ items: data.items, total: data.total, itemsCount: data.items_count })
    } catch {
      set({ items: [], total: 0, itemsCount: 0 })
    } finally {
      set({ loading: false })
    }
  },

  addItem: async (productId, quantity = 1) => {
    set({ loading: true })
    try {
      const { data } = await cartAPI.add({ product_id: productId, quantity })
      set({ items: data.items, total: data.total, itemsCount: data.items_count })
      return true
    } catch (err) {
      return err.response?.data?.detail || false
    } finally {
      set({ loading: false })
    }
  },

  updateItem: async (itemId, quantity) => {
    const { data } = await cartAPI.update(itemId, quantity)
    set({ items: data.items, total: data.total, itemsCount: data.items_count })
  },

  removeItem: async (itemId) => {
    const { data } = await cartAPI.remove(itemId)
    set({ items: data.items, total: data.total, itemsCount: data.items_count })
  },

  clearCart: async () => {
    await cartAPI.clear()
    set({ items: [], total: 0, itemsCount: 0, promoCode: null, promoDiscount: 0 })
  },

  applyPromo: (code, discountAmount) => {
    set({ promoCode: code, promoDiscount: discountAmount })
  },

  removePromo: () => {
    set({ promoCode: null, promoDiscount: 0 })
  },

  finalTotal: () => {
    const { total, promoDiscount } = get()
    return Math.max(0, total - promoDiscount)
  },
}))

export default useCartStore
