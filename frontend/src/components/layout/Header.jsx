import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useAuthStore from '../../store/useAuthStore'
import useCartStore from '../../store/useCartStore'

const PHONE = '+7 (993) 032-02-32'
const PHONE_LINK = 'tel:+79930320232'

function SocialCircle({ href, label, children, className = '' }) {
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      aria-label={label}
      className={`w-9 h-9 bg-[#071456] rounded-full flex items-center justify-center hover:bg-[#FF4400] transition-colors text-white text-sm font-bold ${className}`}>
      {children}
    </a>
  )
}

export default function Header() {
  const { user, isAuth, logout, fetchMe } = useAuthStore()
  const { itemsCount, fetchCart } = useCartStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (isAuth()) {
      fetchMe()
      fetchCart()
    }
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-[1500px] mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0" onClick={() => setMenuOpen(false)}>
          <img src="/images/logoheader.png" alt="Эпл Пипл" className="h-8 md:h-12 w-auto object-contain" />
        </Link>

        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#071456]">
          <Link to="/catalog" className="hover:text-[#FF4400] transition-colors">Каталог</Link>
          <a href="/#why-us" className="hover:text-[#FF4400] transition-colors">Почему мы</a>
          <a href="/#contacts" className="hover:text-[#FF4400] transition-colors">Контакты</a>
        </nav>

        <div className="flex items-center gap-3 md:gap-6">
          <div className="hidden sm:flex items-center gap-3">
            <SocialCircle href="https://t.me/pplapple" label="Telegram">TG</SocialCircle>
            <SocialCircle href="https://wa.me/79930320232" label="WhatsApp" className="hidden md:flex">WA</SocialCircle>
            <SocialCircle href="https://max.ru/join/vJSGAHeQXN7hU_rNUNMOhDMCB_lPaSzBOobJOg0QaeA" label="Max">M</SocialCircle>
          </div>

          <div className="hidden md:block text-[#071456] text-sm whitespace-nowrap">11:00-20:00</div>
          <a href={PHONE_LINK} className="hidden md:block text-[#071456] hover:text-[#FF4400] transition-colors whitespace-nowrap">{PHONE}</a>

          {isAuth() && (
            <Link to="/cart" className="relative w-9 h-9 bg-[#071456] rounded-full flex items-center justify-center hover:bg-[#FF4400] transition-colors text-white" aria-label="Корзина">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13 5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
              </svg>
              {itemsCount > 0 && <span className="absolute -top-1 -right-1 bg-[#FF4400] text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">{itemsCount > 9 ? '9+' : itemsCount}</span>}
            </Link>
          )}

          {isAuth() ? (
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 text-sm hover:text-[#FF4400] transition-colors text-[#071456]">
                <div className="w-9 h-9 bg-[#FF4400] rounded-full flex items-center justify-center font-bold text-xs text-white">
                  {user?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="hidden xl:block max-w-[160px] truncate">{user?.full_name || user?.email}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-3 w-56 bg-white text-gray-800 rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
                  <Link to="/orders" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-sm hover:bg-neutral-50 transition-colors">Мои заказы</Link>
                  {user?.role === 'admin' && <Link to="/admin" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-sm hover:bg-neutral-50 transition-colors text-[#FF4400] font-medium">Админ-панель</Link>}
                  <hr className="border-gray-100" />
                  <button onClick={handleLogout} className="block w-full text-left px-4 py-3 text-sm hover:bg-neutral-50 transition-colors text-red-500">Выйти</button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="hidden sm:inline-flex px-5 py-2.5 bg-[#FF4400] text-white rounded-full text-sm font-medium hover:opacity-90 transition">Войти</Link>
          )}

          <button className="lg:hidden w-9 h-9 bg-[#071456] rounded-full flex items-center justify-center text-white" onClick={() => setMenuOpen(!menuOpen)} aria-label="Меню">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="lg:hidden border-t border-gray-100 bg-white px-4 pb-4 pt-2 flex flex-col gap-2 text-sm text-[#071456]">
          <Link to="/catalog" className="py-2 hover:text-[#FF4400]" onClick={() => setMenuOpen(false)}>Каталог</Link>
          <a href="/#why-us" className="py-2 hover:text-[#FF4400]" onClick={() => setMenuOpen(false)}>Почему мы</a>
          <a href="/#contacts" className="py-2 hover:text-[#FF4400]" onClick={() => setMenuOpen(false)}>Контакты</a>
          {!isAuth() && <Link to="/login" className="btn-primary w-fit mt-2" onClick={() => setMenuOpen(false)}>Войти</Link>}
        </div>
      )}
    </header>
  )
}
