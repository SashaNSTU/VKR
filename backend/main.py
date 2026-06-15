from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings
from database import engine, Base, SessionLocal, ensure_columns
from models import User, Product, PromoCode
from auth import hash_password
from routers import auth, products, cart, orders, promo, admin
from routers import payments
from services.antifraud_config import seed_rule_state


def seed_database():
    """Начальное заполнение БД тестовыми данными (только при первом запуске)"""
    db = SessionLocal()
    try:
        # Администратор
        if not db.query(User).filter(User.email == "admin@applpeople.ru").first():
            db.add(User(
                email="admin@applpeople.ru",
                hashed_password=hash_password("admin123"),
                full_name="Администратор",
                role="admin",
            ))

        # Тестовый покупатель
        if not db.query(User).filter(User.email == "test@test.ru").first():
            db.add(User(
                email="test@test.ru",
                hashed_password=hash_password("test123"),
                full_name="Тестовый Пользователь",
                phone="+79991234567",
                registered_ip="127.0.0.1",
            ))

        # Товары
        products_data = [
            dict(name="iPhone 17 Pro", brand="Apple", category="iPhone",
                 model="iPhone 17 Pro 256GB Natural Titanium",
                 price=129990, stock=15, image_url="/images/17pro.png",
                 description="Новейший iPhone с чипом A19 Pro"),
            dict(name="iPhone 17 Pro Max", brand="Apple", category="iPhone",
                 model="iPhone 17 Pro Max 512GB Black Titanium",
                 price=154990, stock=8, image_url="/images/17pro.png",
                 description="Максимальная производительность и автономность"),
            dict(name="iPhone 17 Air", brand="Apple", category="iPhone",
                 model="iPhone 17 Air 128GB Blue",
                 price=94990, stock=20, image_url="/images/OrangeBlueiPhone17Pro.png",
                 description="Ультратонкий и лёгкий iPhone"),
            dict(name="MacBook Air M3", brand="Apple", category="MacBook",
                 model='MacBook Air 13" M3 8GB/256GB Midnight',
                 price=109990, stock=10, image_url="/images/macbook.png",
                 description="Тонкий и мощный ноутбук для работы и учёбы"),
            dict(name="MacBook Pro M4", brand="Apple", category="MacBook",
                 model='MacBook Pro 14" M4 Pro 24GB/512GB Space Black',
                 price=219990, stock=5, image_url="/images/macbook.png",
                 description="Профессиональный ноутбук с Liquid Retina XDR"),
            dict(name="iPad Air M2", brand="Apple", category="iPad",
                 model='iPad Air 11" M2 128GB Wi-Fi Blue',
                 price=69990, stock=12, image_url="/images/ipad.png",
                 description="Мощный планшет для творчества и работы"),
            dict(name="Apple Watch Ultra 2", brand="Apple", category="Apple Watch",
                 model="Apple Watch Ultra 2 49mm Black Titanium",
                 price=89990, stock=7, image_url="/images/applewatch.png",
                 description="Часы для экстремальных условий"),
            dict(name="Apple Watch SE", brand="Apple", category="Apple Watch",
                 model="Apple Watch SE 40mm Midnight Aluminium",
                 price=29990, stock=25, image_url="/images/applewatch.png",
                 description="Доступные смарт-часы с ключевыми функциями"),
            dict(name="AirPods Pro 2", brand="Apple", category="AirPods",
                 model="AirPods Pro 2nd gen USB-C",
                 price=24990, stock=30, image_url="/images/airpods.png",
                 description="Активное шумоподавление нового уровня"),
            dict(name="AirPods Max", brand="Apple", category="AirPods",
                 model="AirPods Max USB-C Midnight",
                 price=59990, stock=6, image_url="/images/airpods.png",
                 description="Накладные наушники с Hi-Fi звуком"),
            dict(name="Dyson Airwrap HS05", brand="Dyson", category="Dyson",
                 model="Dyson Airwrap Multi-Styler HS05",
                 price=49990, stock=10, image_url="/images/dyson.png",
                 description="Стайлер для укладки без экстремального жара"),
            dict(name="Dyson Supersonic HD15", brand="Dyson", category="Dyson",
                 model="Dyson Supersonic HD15 Vinca Blue",
                 price=39990, stock=8, image_url="/images/dyson.png",
                 description="Фен с интеллектуальным контролем температуры"),
            dict(name="Samsung Galaxy S25 Ultra", brand="Samsung", category="Samsung",
                 model="Samsung Galaxy S25 Ultra 256GB Titanium Black",
                 price=119990, stock=15, image_url="/images/samsung.png",
                 description="Флагман с встроенным Galaxy AI"),
            dict(name="Яндекс Станция Макс", brand="Яндекс", category="Яндекс",
                 model="Яндекс Станция Макс Gen 2",
                 price=10, stock=100, image_url="/images/yandexmax.png",
                 description="Умная колонка с Алисой и Zigbee-хабом"),
        ]
        for p in products_data:
            if not db.query(Product).filter(Product.name == p["name"]).first():
                db.add(Product(**p))

        # Промокоды
        promos_data = [
            dict(code="FIRST10", description="Скидка 10% на первый заказ",
                 discount_percent=10, is_first_order_only=True, max_uses=None),
            dict(code="APPLE15", description="Скидка 15% на любой заказ",
                 discount_percent=15, is_first_order_only=False, max_uses=100),
            dict(code="WELCOME5", description="Приветственная скидка 5%",
                 discount_percent=5, is_first_order_only=False, max_uses=500),
        ]
        for pr in promos_data:
            if not db.query(PromoCode).filter(PromoCode.code == pr["code"]).first():
                db.add(PromoCode(**pr))

        db.commit()
        print("✅ БД инициализирована")
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка seed: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_columns()
    seed_rule_state(SessionLocal)
    seed_database()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
## Торговая платформа «Эпл Пипл»

API для управления каталогом, корзиной, заказами и промокодами.
Антифрод-модуль будет добавлен на следующем этапе.

### Тестовые учётные данные
- **Покупатель:** test@test.ru / test123
- **Администратор:** admin@applpeople.ru / admin123
    """,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(cart.router)
app.include_router(orders.router)
app.include_router(promo.router)
app.include_router(admin.router)
app.include_router(payments.router)

@app.get("/", tags=["Root"])
def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "status": "running 🚀",
    }


@app.get("/health", tags=["Root"])
def health():
    return {"status": "ok"}
