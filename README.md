# Интернет-магазин с трёхуровневой антифрод-системой

Прототип e-commerce платформы с многоуровневой защитой от мошенничества
с промо-механиками: поведенческие сигналы, fingerprint-детект,
post-payment связы

**Стек:**
- Backend: Python 3.11+ / FastAPI / SQLAlchemy / SQLite
- Frontend: React 18 / Vite / Tailwind CSS / Zustand
- Платежи: YooKassa (тестовый режим)

**Порты:**
| Сервис | Порт |
|---|---|
| Backend (FastAPI) | `8002` |
| Frontend (Vite dev-server) | `5173` |

---

## Требования

- **Python** 3.11 или новее
- **Node.js** 18 или новее (вместе с npm)
- **Git**

Проверить версии:
```bash
python --version
node --version
npm --version
```

---

## Установка и запуск

### 1. Клонирование репозитория

```bash
git clone https://github.com/SashaNSTU/VKR.git
cd VKR
```

### 2. Backend

```bash
cd backend

# Создать виртуальное окружение
python -m venv venv

# Активировать
# Windows (PowerShell):
venv\Scripts\Activate.ps1
# Windows (cmd):
venv\Scripts\activate.bat
# Linux / macOS:
source venv/bin/activate

# Установить зависимости
pip install -r requirements.txt

# Запустить сервер
uvicorn main:app --reload --port 8002
```

После запуска будут доступны:
- API: <http://localhost:8002>
- Swagger UI (документация эндпоинтов): <http://localhost:8002/docs>
- Health check: <http://localhost:8002/health>

При первом запуске автоматически создаются:
- БД `applpeople_8002.db` (SQLite)
- Тестовые товары (iPhone, AirPods и др.)
- Тестовые пользователи (см. ниже)
- Тестовые промокоды
- Состояние антифрод-правил по дефолтным значениям

### 3. Frontend

В **новом терминале** (backend оставить запущенным):

```bash
cd frontend

# Установить зависимости
npm install

# Запустить dev-сервер
npm run dev
```

После запуска приложение доступно: <http://localhost:5173>

---

## Тестовые учётные данные

После первого запуска backend сидит тестовых пользователей:

| Роль | Email | Пароль |
|---|---|---|
| Покупатель | `test@test.ru` | `test123` |
| Администратор | `admin@applpeople.ru` | `admin123` |

Админ-панель доступна по адресу <http://localhost:5173/admin>
после входа под админ-аккаунтом.

---

## Тестовые промокоды

| Код | Скидка | Условия |
|---|---|---|
| `FIRST10` | 10% | Только на первый заказ |
| `SUMMER15` | 15% | Любой заказ |
| `MEGA20` | 20% | Заказ от 50 000 ₽ |

---

## Платежи (YooKassa)

В `backend/config.py` уже прописаны **тестовые** учётные данные YooKassa.
Для оплаты картой используются тестовые номера из официальной документации:

| Карта | Тип | Результат |
|---|---|---|
| `5555 5555 5555 4444` | MasterCard | Успешная оплата |
| `4111 1111 1111 1111` | Visa | Успешная оплата |
| `2200 0000 0000 0004` | Mir | Успешная оплата |
| `3700 0000 0000 002` | American Express | Успешная оплата |

CVC: любые 3 цифры, дата: любая в будущем.

> **Важно:** webhook'и YooKassa в локальной разработке **не приходят** на
> `localhost`. Для отправки статусов оплаты используется ручная синхронизация
> через `paymentsAPI.sync(orderId)` — она автоматически вызывается на странице
> заказа.

---

## Структура проекта

```
.
├── backend/                     # FastAPI приложение
│   ├── main.py                  # Точка входа, seed данных
│   ├── config.py                # Настройки (порт, ключи, БД)
│   ├── database.py              # Подключение SQLite
│   ├── models.py                # Модели БД (SQLAlchemy)
│   ├── schemas.py               # Pydantic-схемы
│   ├── auth.py                  # JWT-авторизация
│   ├── routers/                 # HTTP-эндпоинты
│   │   ├── auth.py              # /auth/register, /auth/login
│   │   ├── products.py          # /products
│   │   ├── cart.py              # /cart
│   │   ├── orders.py            # /orders
│   │   ├── promo.py             # /promo
│   │   ├── payments.py          # /payments (YooKassa)
│   │   └── admin.py             # /admin
│   ├── services/
│   │   ├── antifraud.py         # Логика антифрод-правил
│   │   ├── antifraud_config.py  # Реестр правил, веса, пороги
│   │   └── http_utils.py        # Извлечение IP клиента
│   └── requirements.txt
│
├── frontend/                    # React приложение
│   ├── src/
│   │   ├── api/                 # axios-клиент
│   │   ├── pages/               # страницы
│   │   ├── components/          # компоненты
│   │   ├── store/               # Zustand stores
│   │   └── lib/
│   │       ├── automation.js    # Детектор автоматизации браузера
│   │       └── behavior.js      # Сбор поведенческих сигналов
│   ├── vite.config.js
│   └── package.json
│
└── Сценарии тестирования BAS/   # XML-сценарии для BAS
```

---

## Антифрод: краткая архитектура

Три фазы проверки в жизненном цикле заказа:

| Фаза | Когда срабатывает | Какие правила |
|---|---|---|
| **on_register** | При регистрации пользователя | Velocity по IP / FP, BAS_AUTOMATION_DETECTED |
| **pre_payment** | При создании заказа | Поведенческие сигналы, связи между аккаунтами |
| **post_payment** | После успешной оплаты | Связывание по платёжной карте |

Веса правил и пороги решений (`approved` / `review` / `blocked`) настраиваются
в админ-панели без перезапуска сервера.

Подробное описание сценариев тестирования см. в файле `BAS_TESTING.md`.

---

## Полезные команды

### Сброс БД

```bash
cd backend
# Удалить файл БД
rm applpeople_8002.db          # Linux/macOS
del applpeople_8002.db         # Windows

# Перезапустить — БД и тестовые данные пересоздадутся
uvicorn main:app --reload --port 8002
```

### Только сборка frontend (production)

```bash
cd frontend
npm run build
# Сборка попадёт в frontend/dist/
```

### Просмотр Swagger

После запуска backend открой <http://localhost:8002/docs>.
Там можно прямо из браузера тестировать любой эндпоинт.

---

## Возможные проблемы

**`Port 8002 is already in use`** — другой процесс занял порт.
Найти и убить:
```bash
# Windows:
netstat -ano | findstr :8002
taskkill /F /PID <PID>

# Linux/macOS:
lsof -i :8002
kill -9 <PID>
```

**`Port 5173 is already in use`** — то же самое для 5173.
Vite настроен на `strictPort: true`, поэтому он не возьмёт другой порт автоматически.

**`ModuleNotFoundError` в Python** — забыл активировать venv.

**CORS error в браузере** — backend не запущен, или запущен не на 8002.
Frontend жёстко обращается к `http://localhost:8002` (см. `frontend/src/api/client.js`).
