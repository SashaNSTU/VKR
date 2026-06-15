# Эпл Пипл — Backend (FastAPI)

## Быстрый старт

```bash
# 1. Установить зависимости
pip install -r requirements.txt

# 2. Запустить сервер
uvicorn main:app --reload

# 3. Открыть документацию
# http://localhost:8000/docs
```

## Тестовые учётные данные

| Роль | Email | Пароль |
|---|---|---|
| Покупатель | test@test.ru | test123 |
| Администратор | admin@applpeople.ru | admin123 |

## Структура проекта

```
backend/
├── main.py           # Точка входа, seed данных
├── config.py         # Настройки (SECRET_KEY, DB URL и т.д.)
├── database.py       # Подключение SQLite
├── models.py         # SQLAlchemy модели (таблицы БД)
├── schemas.py        # Pydantic схемы (валидация)
├── auth.py           # JWT авторизация
├── routers/
│   ├── auth.py       # POST /auth/register, /auth/login
│   ├── products.py   # GET/POST /products
│   ├── cart.py       # GET/POST/DELETE /cart
│   ├── orders.py     # POST /orders, GET /orders/my
│   ├── promo.py      # POST /promo/apply
│   └── admin.py      # GET /admin/users, /admin/fraud-logs
└── applpeople.db     # SQLite БД (создаётся автоматически)
```

## Эндпоинты

### Авторизация
- `POST /auth/register` — регистрация
- `POST /auth/login` — вход (JSON)
- `POST /auth/login/form` — вход (Swagger OAuth2)
- `GET  /auth/me` — профиль текущего пользователя

### Товары
- `GET  /products` — каталог (фильтры: brand, category, min_price, max_price, search)
- `GET  /products/{id}` — карточка товара
- `GET  /products/brands` — список брендов
- `GET  /products/categories` — список категорий
- `POST /products` — создать товар [admin]
- `PATCH /products/{id}` — обновить товар [admin]

### Корзина
- `GET    /cart` — содержимое корзины
- `POST   /cart/add` — добавить товар
- `PATCH  /cart/{item_id}` — изменить количество
- `DELETE /cart/{item_id}` — удалить позицию
- `DELETE /cart` — очистить корзину

### Заказы
- `POST /orders` — оформить заказ (очищает корзину)
- `GET  /orders/my` — мои заказы
- `GET  /orders/my/{id}` — детали заказа
- `GET  /orders` — все заказы [admin]
- `PATCH /orders/{id}/status` — сменить статус [admin]

### Промокоды
- `POST /promo/apply` — проверить и применить промокод
- `GET  /promo` — список промокодов [admin]
- `POST /promo` — создать промокод [admin]

### Администратор
- `GET   /admin/users` — список пользователей
- `PATCH /admin/users/{id}/block` — заблокировать
- `GET   /admin/fraud-logs` — 🔒 лог антифрода (следующий этап)

## Антифрод (следующий этап)
Таблица `fraud_logs` уже создана в БД.
Поля для сигналов фрода уже есть в моделях:
- `users.registered_ip`, `users.device_fingerprint`
- `orders.order_ip`, `orders.order_device_fp`, `orders.payment_card_hash`
- `promo_usages` — история использования промокодов
