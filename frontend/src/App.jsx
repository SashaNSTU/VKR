import { Routes, Route } from 'react-router-dom'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import HomePage from './pages/HomePage'
import CatalogPage from './pages/CatalogPage'
import ProductPage from './pages/ProductPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import OrdersPage from './pages/OrdersPage'
import OrderDetailPage from './pages/OrderDetailPage'
import AdminPage from './pages/AdminPage'
import PaymentResultPage from './pages/PaymentResultPage'

export default function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/"           element={<HomePage />} />
          <Route path="/catalog"    element={<CatalogPage />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/cart"       element={<CartPage />} />
          <Route path="/checkout"   element={<CheckoutPage />} />
          <Route path="/login"      element={<LoginPage />} />
          <Route path="/register"   element={<RegisterPage />} />
          <Route path="/orders"     element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/payment-result" element={<PaymentResultPage />} />
          <Route path="/admin"      element={<AdminPage />} />
          <Route path="*"           element={
            <div className="text-center py-24">
              <div className="text-7xl mb-4">🔍</div>
              <h2 className="text-2xl font-bold text-brand-navy mb-2">Страница не найдена</h2>
              <a href="/" className="text-accent hover:underline">← На главную</a>
            </div>
          } />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
