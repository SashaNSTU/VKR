# Эпл Пипл — Frontend (React + Vite + Tailwind)

## Быстрый старт

```bash
# 1. Установить зависимости
npm install

# 2. Запустить dev-сервер
npm run dev
# → http://localhost:5173

# 3. Убедись что бэкенд запущен на :8000
# Все запросы /api/* проксируются на http://localhost:8000
```

## Страницы

| URL | Страница |
|---|---|
| `/` | Главная (Hero, категории, о нас) |
| `/catalog` | Каталог с фильтрами по бренду/цене/поиску |
| `/product/:id` | Карточка товара |
| `/cart` | Корзина с промокодом |
| `/checkout` | Оформление заказа |
| `/login` | Вход |
| `/register` | Регистрация |
| `/orders` | Мои заказы |
| `/orders/:id` | Детали заказа |
| `/admin` | Админ-панель [только admin] |

## Стек

- React 18 + React Router 6
- Zustand (стейт: авторизация, корзина)
- Axios (API клиент с JWT interceptor)
- Tailwind CSS 3 (цвета: #071456 navy + #FF4400 accent)
- Vite 5 (dev proxy → FastAPI :8000)

## Тестовые данные

| Роль | Email | Пароль |
|---|---|---|
| Покупатель | test@test.ru | test123 |
| Администратор | admin@applpeople.ru | admin123 |
