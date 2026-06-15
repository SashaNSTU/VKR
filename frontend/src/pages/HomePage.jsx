import { Link } from 'react-router-dom'

const CATEGORIES = [
  { name: 'iPhone', image: '/images/17pro.png', brand: 'Apple', q: 'iPhone', tags: ['iPhone 17', 'iPhone 17 Air', 'iPhone 17 Pro/ProMax'] },
  { name: 'Samsung', image: '/images/samsung.png', brand: 'Samsung', q: 'Samsung', tags: ['Galaxy S', 'Galaxy A', 'Fold'] },
  { name: 'MacBook', image: '/images/macbook.png', brand: 'Apple', q: 'MacBook', tags: ['Air', 'Pro'] },
  { name: 'iPad', image: '/images/ipad.png', brand: 'Apple', q: 'iPad', tags: ['Pro', 'Air', 'Mini'] },
  { name: 'Apple Watch', image: '/images/applewatch.png', brand: 'Apple', q: 'Apple Watch', tags: ['Ultra', 'SE'] },
  { name: 'AirPods', image: '/images/airpods.png', brand: 'Apple', q: 'AirPods', tags: ['Pro', 'Max', '4'] },
  { name: 'PlayStation', image: '/images/ps5.png', brand: 'Sony', q: 'PlayStation', tags: ['Pro', 'BluRay', 'Digital'] },
  { name: 'Dyson', image: '/images/dyson.png', brand: 'Dyson', q: 'Dyson', tags: ['HS05', 'HS08', 'HD15'] },
  { name: 'Умные колонки', image: '/images/yandexmax.png', brand: 'Яндекс', q: 'Яндекс', tags: ['Яндекс Мини', 'Яндекс Миди', 'Яндекс Макс'] },
]

const WHY_US = [
  { title: 'Официальная гарантия', desc: 'Гарантия до 1 года на всю технику. Спокойно пользуйтесь — мы рядом.' },
  { title: 'Trade-In без лишних сложностей', desc: 'Оценим ваше устройство и предложим выгодный обмен с доплатой.' },
  { title: 'Настроим всё за вас', desc: 'Перенесём данные, установим приложения и подготовим устройство к работе.' },
  { title: 'Поддержка', desc: 'Поможем и ответим на любые вопросы — всегда на связи.' },
]

export default function HomePage() {
  return (
    <div className="bg-white">
      <section className="relative bg-[#071456] rounded-b-[40px] overflow-hidden">
        <div className="max-w-[1500px] mx-auto px-4 pt-3 md:pt-16 relative z-10">
          <div className="grid md:grid-cols-2 gap-8 md:gap-20 items-end">
            <div className="pt-4 md:pt-8 pb-10 md:pb-34">
              <h1 className="text-4xl md:text-5xl lg:text-6xl text-white uppercase tracking-tight mb-6 leading-tight font-medium">
                Оригинальная техника по понятной цене
              </h1>
              <p className="text-lg text-white/90 mb-8">Говорим на одном языке с клиентами</p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a href="tel:+79930320232" className="bg-[#FF4400] text-white px-8 py-4 rounded-lg hover:bg-[#e63d00] transition-colors inline-block text-center font-medium">
                  Связаться с нами
                </a>
                <Link to="/catalog" className="border border-white/40 text-white px-8 py-4 rounded-lg hover:bg-white hover:text-[#071456] transition-colors inline-block text-center font-medium">
                  Каталог товаров
                </Link>
              </div>
            </div>
            <div className="relative flex justify-center items-end">
              <img src="/images/OrangeBlueiPhone17Pro.png" alt="iPhone" className="w-[120%] h-auto max-w-none" />
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-24 bg-neutral-100 relative overflow-hidden rounded-t-[40px] rounded-b-[40px]">
        <div className="max-w-[1500px] mx-auto px-4">
          <h2 className="text-3xl md:text-4xl text-[#071456] uppercase mb-6 md:mb-10 font-medium">Популярные категории</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {CATEGORIES.map((cat) => (
              <Link key={cat.name} to={`/catalog?brand=${cat.brand}&category=${cat.q}`} className="bg-white rounded-3xl p-4 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <h3 className="text-xl font-semibold text-[#071456] tracking-tight">{cat.name}</h3>
                <div className="w-8 h-[2px] bg-[#ff4400] mt-2 mb-4" />
                <img src={cat.image} alt={cat.name} className="w-full h-[220px] object-contain mx-auto" />
                <div className="mt-4 text-sm text-[#ff4400] leading-relaxed">{cat.tags.join(' • ')}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="why-us" className="py-12 md:py-24 bg-white">
        <div className="max-w-[1500px] mx-auto px-4">
          <h2 className="text-3xl md:text-4xl text-[#071456] uppercase text-left mb-6 md:mb-10 font-medium">Почему выбирают нас</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {WHY_US.map((item) => (
              <div key={item.title} className="bg-neutral-50 rounded-3xl p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <h3 className="text-xl font-semibold text-[#071456]">{item.title}</h3>
                <div className="w-10 h-[2px] bg-[#ff4400] mt-2 mb-4" />
                <p className="text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contacts" className="py-12 md:py-24 bg-white">
        <div className="max-w-[1500px] mx-auto px-4">
          <h2 className="text-3xl md:text-4xl text-[#071456] uppercase mb-6 md:mb-10 font-medium">Наш магазин</h2>
          <div className="grid md:grid-cols-2 gap-8 items-stretch">
            <div className="rounded-3xl overflow-hidden min-h-[320px] bg-neutral-100">
              <iframe
                title="Карта магазина"
                src="https://yandex.ru/map-widget/v1/?text=Новосибирск%2C%20Гоголя%2038&z=16"
                width="100%"
                height="100%"
                className="min-h-[320px] h-full w-full border-0 rounded-3xl"
                loading="lazy"
              />
            </div>
            <div className="relative rounded-3xl overflow-hidden h-[420px]">
              <img src="/images/store.png" alt="Магазин" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-[#071456]/50" />
              <div className="relative z-10 p-6 md:p-8 text-white h-full flex flex-col justify-between">
                <div className="space-y-6 max-w-[85%]">
                  <div><div className="text-xs uppercase tracking-widest opacity-70 mb-1">Адрес</div><div className="text-base md:text-lg">г. Новосибирск, ул. Гоголя, 38<br />ТЦ Маршал, Цокольный этаж</div></div>
                  <div><div className="text-xs uppercase tracking-widest opacity-70 mb-1">Режим работы</div><div className="text-base md:text-lg">Ежедневно с 11:00 до 20:00</div></div>
                  <div><div className="text-xs uppercase tracking-widest opacity-70 mb-1">Телефон</div><a href="tel:+79930320232" className="text-[#FF4400] text-xl md:text-2xl font-semibold">+7 (993) 032-02-32</a></div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a href="https://go.2gis.com/84lZ7" target="_blank" rel="noopener noreferrer" className="px-5 py-2.5 bg-white text-[#071456] rounded-full text-sm font-medium hover:bg-[#FF4400] hover:text-white transition">2ГИС</a>
                  <a href="https://yandex.ru/maps/-/CPCTBAou" target="_blank" rel="noopener noreferrer" className="px-5 py-2.5 bg-[#FF4400] text-white rounded-full text-sm font-medium hover:opacity-90 transition">Яндекс</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
