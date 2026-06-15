import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer id="contacts-footer" className="bg-[#071456] text-white py-10 md:py-14">
      <div className="max-w-[1500px] mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-10 md:gap-8 mb-10 items-start">
          <div className="max-w-[320px]">
            <Link to="/" className="inline-block mb-3">
              <img src="/images/footerlogo.png" alt="Эпл Пипл" className="h-12 md:h-16 w-auto object-contain" />
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed">Оригинальная техника Apple в Новосибирске</p>
          </div>
          <div className="md:mx-auto">
            <h4 className="uppercase text-sm tracking-wide mb-4 text-white/80">Контакты</h4>
            <div className="space-y-2 text-sm text-gray-400">
              <p>г. Новосибирск, ул. Гоголя, 38</p>
              <a href="tel:+79930320232" className="block hover:text-[#FF4400] transition-colors">+7 (993) 032-02-32</a>
              <p>Ежедневно 11:00 - 20:00</p>
              <Link to="/catalog" className="block hover:text-[#FF4400] transition-colors">Каталог товаров</Link>
            </div>
          </div>
          <div className="md:ml-auto">
            <h4 className="uppercase text-sm tracking-wide mb-4 text-white/80">Мы в соцсетях</h4>
            <div className="flex gap-3">
              <a href="https://t.me/pplapple" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#FF4400] transition font-semibold">TG</a>
              <a href="https://wa.me/79930320232" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#FF4400] transition font-semibold">WA</a>
              <a href="https://max.ru/join/vJSGAHeQXN7hU_rNUNMOhDMCB_lPaSzBOobJOg0QaeA" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#FF4400] transition font-semibold">M</a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 text-xs text-gray-500 flex flex-col md:flex-row gap-2 justify-between">
          <span>© 2025 Эпл Пипл.</span>
          <span>Торговая платформа с сохранённой логикой заказов и кабинета.</span>
        </div>
      </div>
    </footer>
  )
}
