from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime
from models import OrderStatus, UserRole
import re


# ─────────────────────────── AUTH ────────────────────────────────

class ClientSignals(BaseModel):
    """Сигналы, собранные клиентом для антифрода."""
    device_fingerprint: Optional[str] = None      # legacy: сырая строка fp
    fp_hash: Optional[str] = None                  # стабильный SHA-256 hash настоящего fp
    fp_components: Optional[dict] = None           # компоненты fp (canvas/webgl/audio/screen/...)
    user_agent: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    screen: Optional[str] = None
    automation_flags: Optional[dict] = None        # {webdriver, headless_gpu, no_plugins, ...}
    automation_score: Optional[int] = 0            # клиентский score автоматизации (0–100)


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    full_name: Optional[str] = None
    phone: Optional[str] = None
    # Сигналы для антифрода
    device_fingerprint: Optional[str] = None
    fp_hash: Optional[str] = None
    fp_components: Optional[dict] = None
    user_agent: Optional[str] = None
    automation_flags: Optional[dict] = None
    automation_score: Optional[int] = 0

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        if v and not re.match(r"^\+?[78]\d{10}$", v):
            raise ValueError("Неверный формат телефона")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device_fingerprint: Optional[str] = None
    fp_hash: Optional[str] = None
    fp_components: Optional[dict] = None
    user_agent: Optional[str] = None
    automation_flags: Optional[dict] = None
    automation_score: Optional[int] = 0


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    phone: Optional[str]
    role: UserRole
    is_active: bool
    is_blocked: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None


# ─────────────────────────── PRODUCT ─────────────────────────────

class ProductOut(BaseModel):
    id: int
    name: str
    brand: str
    category: str
    model: Optional[str]
    description: Optional[str]
    price: float
    stock: int
    image_url: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    brand: str = Field(min_length=2, max_length=100)
    category: str = Field(min_length=2, max_length=100)
    model: Optional[str] = None
    description: Optional[str] = None
    price: float = Field(gt=0)
    stock: int = Field(ge=0, default=0)
    image_url: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ProductFilter(BaseModel):
    brand: Optional[str] = None
    category: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    search: Optional[str] = None


# ─────────────────────────── CART ────────────────────────────────

class CartItemAdd(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, default=1)


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=1)


class CartItemOut(BaseModel):
    id: int
    product_id: int
    quantity: int
    product: ProductOut

    class Config:
        from_attributes = True


class CartOut(BaseModel):
    items: List[CartItemOut]
    total: float
    items_count: int


# ─────────────────────────── ORDER ───────────────────────────────

class OrderItemOut(BaseModel):
    id: int
    product_id: int
    quantity: int
    price: float
    product: ProductOut

    class Config:
        from_attributes = True


class OrderCreate(BaseModel):
    delivery_address: Optional[str] = None
    delivery_city: Optional[str] = None
    recipient_name: Optional[str] = None
    recipient_phone: Optional[str] = None
    payment_method: str = "card"
    promo_code: Optional[str] = None

    # ── Антифрод-сигналы клиента ──────────────────────────────
    # Полные данные карты не принимаем: они идут только через YooKassa.
    device_fingerprint: Optional[str] = None      # legacy строка fp (UA или fp_hash)
    fp_hash: Optional[str] = None                  # стабильный SHA-256 настоящего fp
    fp_components: Optional[dict] = None           # компоненты fp (canvas/webgl/audio/screen/...)
    user_agent: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    screen: Optional[str] = None
    automation_flags: Optional[dict] = None
    automation_score: Optional[int] = 0
    time_on_page_ms: Optional[int] = None
    form_fill_ms: Optional[int] = None
    mouse_events: Optional[int] = None
    key_events: Optional[int] = None
    touch_events: Optional[int] = None


class OrderOut(BaseModel):
    id: int
    user_id: int
    status: OrderStatus
    total_price: float
    discount_amount: float
    final_price: float
    delivery_address: Optional[str]
    delivery_city: Optional[str]
    recipient_name: Optional[str]
    recipient_phone: Optional[str]
    payment_method: str

    payment_status: Optional[str] = None
    payment_url: Optional[str] = None
    is_paid: bool = False

    payment_method_id: Optional[str] = None
    payment_method_type: Optional[str] = None

    card_first6: Optional[str] = None
    card_last4: Optional[str] = None
    card_type: Optional[str] = None
    card_issuer_country: Optional[str] = None
    card_issuer_name: Optional[str] = None

    promo_code_id: Optional[int]
    refund_note: Optional[str] = None
    items: List[OrderItemOut]
    created_at: datetime

    class Config:
        from_attributes = True


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


# ─────────────────────────── PROMO ───────────────────────────────

class PromoCodeCreate(BaseModel):
    code: str = Field(min_length=3, max_length=50)
    description: Optional[str] = None
    discount_percent: float = Field(gt=0, le=100)
    max_uses: Optional[int] = None
    is_first_order_only: bool = False
    expires_at: Optional[datetime] = None


class PromoCodeOut(BaseModel):
    id: int
    code: str
    description: Optional[str]
    discount_percent: float
    max_uses: Optional[int]
    used_count: int
    is_first_order_only: bool
    is_active: bool
    expires_at: Optional[datetime]

    class Config:
        from_attributes = True


class PromoApplyRequest(BaseModel):
    code: str
    cart_total: float


class PromoApplyResponse(BaseModel):
    valid: bool
    discount_percent: float = 0.0
    discount_amount: float = 0.0
    final_total: float = 0.0
    message: str = ""
    promo_id: Optional[int] = None


# ─────────────────────────── COMMON ──────────────────────────────

class MessageResponse(BaseModel):
    message: str


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    per_page: int
    pages: int


# ──────────────────────── ANTIFRAUD ADMIN ────────────────────────

class AntifraudRuleOut(BaseModel):
    code: str
    description: str
    phase: str
    default_weight: int
    weight: int
    enabled: bool


class AntifraudRuleUpdate(BaseModel):
    enabled: Optional[bool] = None
    score_weight: Optional[int] = Field(None, ge=0, le=200)


class AntifraudMetricsOut(BaseModel):
    total_logs: int
    by_decision: dict
    by_phase: dict
    by_rule: dict
    avg_score: float
    blocked_users: int
