from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, ForeignKey, Text, Enum as SAEnum,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base


# ───────────────────────────── ENUMS ─────────────────────────────

class OrderStatus(str, enum.Enum):
    pending         = "pending"           # Ожидает оплаты
    pending_review  = "pending_review"    # На ручной проверке (антифрод)
    paid            = "paid"              # Оплачен
    processing      = "processing"        # В обработке
    shipped         = "shipped"           # Отправлен
    delivered       = "delivered"         # Доставлен
    cancelled       = "cancelled"         # Отменён
    fraud_blocked   = "fraud_blocked"     # Заблокирован антифродом


class SessionEventType(str, enum.Enum):
    register = "register"
    login    = "login"
    order    = "order"


class UserRole(str, enum.Enum):
    customer = "customer"
    admin    = "admin"


# ───────────────────────────── USER ──────────────────────────────

class User(Base):
    __tablename__ = "users"

    id                  = Column(Integer, primary_key=True, index=True)
    email               = Column(String(255), unique=True, index=True, nullable=False)
    phone               = Column(String(20), unique=True, nullable=True)
    full_name           = Column(String(255), nullable=True)
    hashed_password     = Column(String(255), nullable=False)
    role                = Column(SAEnum(UserRole), default=UserRole.customer)
    is_active           = Column(Boolean, default=True)
    is_blocked          = Column(Boolean, default=False)

    # Антифрод поля
    registered_ip       = Column(String(45), nullable=True)   # IPv4/IPv6
    device_fingerprint  = Column(String(255), nullable=True)  # хэш браузера (последний)
    registered_fp_hash  = Column(String(64), nullable=True, index=True)  # fp при регистрации
    registered_ua       = Column(String(500), nullable=True)
    auto_flag_blocked   = Column(Boolean, default=False)  # признак: блок установлен антифродом

    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())

    # Связи
    orders              = relationship("Order", back_populates="user")
    cart_items          = relationship("CartItem", back_populates="user", cascade="all, delete-orphan")
    promo_usages        = relationship("PromoUsage", back_populates="user")
    fraud_logs          = relationship("FraudLog", back_populates="user")
    sessions            = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")


# ───────────────────────────── PRODUCT ───────────────────────────

class Product(Base):
    __tablename__ = "products"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(255), nullable=False)
    brand           = Column(String(100), nullable=False, index=True)   # Apple, Dyson, Samsung...
    category        = Column(String(100), nullable=False, index=True)   # iPhone, MacBook, ...
    model           = Column(String(255), nullable=True)                # iPhone 17 Pro 256GB
    description     = Column(Text, nullable=True)
    price           = Column(Float, nullable=False)
    stock           = Column(Integer, default=0)
    image_url       = Column(String(500), nullable=True)
    is_active       = Column(Boolean, default=True)

    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    # Связи
    cart_items      = relationship("CartItem", back_populates="product")
    order_items     = relationship("OrderItem", back_populates="product")


# ───────────────────────────── CART ──────────────────────────────

class CartItem(Base):
    __tablename__ = "cart_items"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_id  = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity    = Column(Integer, default=1, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    user        = relationship("User", back_populates="cart_items")
    product     = relationship("Product", back_populates="cart_items")


# ───────────────────────────── ORDER ─────────────────────────────

class Order(Base):
    __tablename__ = "orders"

    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(Integer, ForeignKey("users.id"), nullable=False)
    status               = Column(SAEnum(OrderStatus), default=OrderStatus.pending)
    total_price          = Column(Float, nullable=False)
    discount_amount      = Column(Float, default=0.0)
    final_price          = Column(Float, nullable=False)
    payment_id = Column(String, nullable=True)
    payment_status = Column(String, default="pending")
    payment_url = Column(String, nullable=True)
    is_paid = Column(Boolean, default=False)

    # YooKassa / антифрод по платёжному методу
    payment_method_id = Column(String(255), nullable=True)
    payment_method_type = Column(String(50), nullable=True)

    card_first6 = Column(String(6), nullable=True)
    card_last4 = Column(String(4), nullable=True)
    card_type = Column(String(50), nullable=True)
    card_issuer_country = Column(String(2), nullable=True)
    card_issuer_name = Column(String(255), nullable=True)

    # Доставка
    delivery_address     = Column(String(500), nullable=True)
    delivery_city        = Column(String(100), nullable=True)
    recipient_name       = Column(String(255), nullable=True)
    recipient_phone      = Column(String(20), nullable=True)

    # Оплата (антифрод — храним только последние 4 цифры)
    payment_method       = Column(String(50), default="card")
    payment_card_last4   = Column(String(4), nullable=True)
    payment_card_hash    = Column(String(255), nullable=True)  # хэш полного номера карты

    # Сессия (антифрод)
    order_ip             = Column(String(45), nullable=True)
    order_device_fp      = Column(String(255), nullable=True)
    order_fp_hash        = Column(String(64), nullable=True, index=True)   # стабильный hash честного fp
    order_fp_components  = Column(Text,        nullable=True)               # JSON компонентов fp
    order_ua             = Column(String(500), nullable=True)
    order_user_agent_short = Column(String(120), nullable=True)             # короткая подпись для агрегаций
    order_timezone       = Column(String(64), nullable=True)
    order_lang           = Column(String(32), nullable=True)
    order_screen         = Column(String(32), nullable=True)
    order_automation_flags = Column(Text, nullable=True)                    # JSON booleans от detector
    order_time_on_page_ms  = Column(Integer, nullable=True)                 # сколько просидел на чекауте
    order_form_fill_ms     = Column(Integer, nullable=True)                 # сколько заполнял форму
    order_mouse_events     = Column(Integer, nullable=True)                 # количество событий мыши
    order_key_events       = Column(Integer, nullable=True)
    order_touch_events     = Column(Integer, nullable=True)

    # Промокод
    promo_code_id        = Column(Integer, ForeignKey("promo_codes.id"), nullable=True)

    # Антифрод: сообщение о возврате (заполняется при post-payment блокировке)
    refund_note          = Column(String(500), nullable=True)

    created_at           = Column(DateTime(timezone=True), server_default=func.now())
    updated_at           = Column(DateTime(timezone=True), onupdate=func.now())

    # Связи
    user                 = relationship("User", back_populates="orders")
    items                = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    promo_code           = relationship("PromoCode", back_populates="orders")
    promo_usages         = relationship("PromoUsage", back_populates="order")
    fraud_logs           = relationship("FraudLog", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"

    id          = Column(Integer, primary_key=True, index=True)
    order_id    = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id  = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity    = Column(Integer, nullable=False)
    price       = Column(Float, nullable=False)   # цена на момент заказа

    # Связи
    order       = relationship("Order", back_populates="items")
    product     = relationship("Product", back_populates="order_items")


# ───────────────────────────── PROMO ─────────────────────────────

class PromoCode(Base):
    __tablename__ = "promo_codes"

    id                  = Column(Integer, primary_key=True, index=True)
    code                = Column(String(50), unique=True, index=True, nullable=False)
    description         = Column(String(255), nullable=True)
    discount_percent    = Column(Float, nullable=False)      # например 10.0 = 10%
    max_uses            = Column(Integer, nullable=True)     # None = безлимит
    used_count          = Column(Integer, default=0)
    is_first_order_only = Column(Boolean, default=False)     # промо только для первого заказа
    is_active           = Column(Boolean, default=True)
    expires_at          = Column(DateTime(timezone=True), nullable=True)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    orders              = relationship("Order", back_populates="promo_code")
    usages              = relationship("PromoUsage", back_populates="promo_code")


class PromoUsage(Base):
    __tablename__ = "promo_usages"

    id            = Column(Integer, primary_key=True, index=True)
    promo_id      = Column(Integer, ForeignKey("promo_codes.id"), nullable=False)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    order_id      = Column(Integer, ForeignKey("orders.id"), nullable=True)
    used_at       = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    promo_code    = relationship("PromoCode", back_populates="usages")
    user          = relationship("User", back_populates="promo_usages")
    order         = relationship("Order", back_populates="promo_usages")


# ─────────────────────────── FRAUD LOG ───────────────────────────
# Таблица готова для антифрод-модуля (заполняется в следующем этапе)

class FraudLog(Base):
    __tablename__ = "fraud_logs"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=True)
    order_id        = Column(Integer, ForeignKey("orders.id"), nullable=True)
    risk_score      = Column(Integer, default=0)          # итоговый скор 0-100
    triggered_rules = Column(Text, nullable=True)         # JSON список сработавших правил
    action_taken    = Column(String(50), nullable=True)   # approved / review / blocked
    details         = Column(Text, nullable=True)         # доп. инфо
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    user            = relationship("User", back_populates="fraud_logs")
    order           = relationship("Order", back_populates="fraud_logs")


# ─────────────────────────── USER SESSION ──────────────────────────
# История всех значимых сессий пользователя: регистрация / логин / заказ.
# Используется velocity-правилами и для разбора админом.

class UserSession(Base):
    __tablename__ = "user_sessions"

    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    event_type        = Column(SAEnum(SessionEventType), nullable=False, index=True)
    ip                = Column(String(45), nullable=True, index=True)
    fp_hash           = Column(String(64), nullable=True, index=True)
    ua                = Column(String(500), nullable=True)
    fp_components     = Column(Text, nullable=True)
    automation_flags  = Column(Text, nullable=True)
    automation_score  = Column(Integer, default=0)       # клиентский score автоматизации
    order_id          = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user              = relationship("User", back_populates="sessions")


# Композитные индексы для velocity-запросов
Index("ix_user_sessions_ip_event_time", UserSession.ip, UserSession.event_type, UserSession.created_at)
Index("ix_user_sessions_fp_event_time", UserSession.fp_hash, UserSession.event_type, UserSession.created_at)


# ─────────────────────── ANTIFRAUD RULE STATE ──────────────────────
# Хранит включён ли каждое правило. Заполняется при первом запуске
# из дефолтов в services/antifraud_config.py.
# Админ может переключать флаги без перезапуска сервиса.

class AntifraudRuleState(Base):
    __tablename__ = "antifraud_rule_state"

    rule_code      = Column(String(64), primary_key=True)
    enabled        = Column(Boolean, default=True, nullable=False)
    score_weight   = Column(Integer, nullable=True)        # переопределение веса (если задано)
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
