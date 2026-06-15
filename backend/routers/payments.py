"""
Платёжный модуль (YooKassa) + интеграция с post-payment антифродом.

Безопасность webhook:
- YooKassa не подписывает webhook'и. Официальная рекомендация — IP whitelist
  + ре-валидация платежа через API (refetch). Так и сделано здесь.
- Из-за IP whitelist в локальной разработке (settings.DEBUG) проверка отключается,
  чтобы можно было прокидывать вебхук через ngrok / ручной curl.
"""

import json
import ipaddress
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from yookassa import Configuration, Payment
from uuid import uuid4

from database import get_db
from config import settings
from models import Order, User
from services.antifraud import check_order_after_payment
from services.http_utils import get_client_ip

router = APIRouter(prefix="/payments", tags=["payments"])

Configuration.account_id = settings.YOOKASSA_SHOP_ID
Configuration.secret_key = settings.YOOKASSA_SECRET_KEY


# Официальные сети YooKassa для входящих webhook'ов.
# Источник: https://yookassa.ru/developers/using-api/webhooks#ip
YOOKASSA_NETWORKS = [
    ipaddress.ip_network("185.71.76.0/27"),
    ipaddress.ip_network("185.71.77.0/27"),
    ipaddress.ip_network("77.75.153.0/25"),
    ipaddress.ip_network("77.75.156.11/32"),
    ipaddress.ip_network("77.75.156.35/32"),
    ipaddress.ip_network("77.75.154.128/25"),
    ipaddress.ip_network("2a02:5180::/32"),
]


def _ip_allowed(ip: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(ip_obj in net for net in YOOKASSA_NETWORKS)


def save_yookassa_payment_data(order: Order, payment_data: dict):
    """Записывает данные платежа в Order (карточные признаки + статусы)."""
    payment_method = payment_data.get("payment_method") or {}
    card = payment_method.get("card") or {}

    order.payment_status = payment_data.get("status")
    order.payment_method_id = payment_method.get("id")
    order.payment_method_type = payment_method.get("type")

    order.card_first6 = card.get("first6")
    order.card_last4 = card.get("last4")
    order.card_type = card.get("card_type")
    order.card_issuer_country = card.get("issuer_country")
    order.card_issuer_name = card.get("issuer_name")

    if payment_data.get("status") == "succeeded":
        order.is_paid = True
        if order.status != "pending_review":
            order.status = "paid"
    elif payment_data.get("status") == "canceled":
        order.is_paid = False
        order.status = "cancelled"


def _run_post_payment_antifraud(db: Session, order: Order):
    """
    Запускает post-payment антифрод, если оплата подтверждена.

    Метод идемпотентный — повторные вызовы безопасны
    (check_order_after_payment обновляет существующий лог).
    """
    if not order.is_paid or order.payment_status != "succeeded":
        return None

    user = db.query(User).filter(User.id == order.user_id).first()
    if not user:
        return None

    return check_order_after_payment(db=db, order=order, user=user)


@router.post("/create/{order_id}")
def create_payment(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    if order.status == "fraud_blocked":
        raise HTTPException(status_code=403, detail="Заказ заблокирован антифродом")

    if getattr(order, "is_paid", False):
        return {
            "status": "already_paid",
            "payment_url": order.payment_url,
            "payment_id": order.payment_id,
        }

    amount_value = f"{float(order.final_price):.2f}"

    payment = Payment.create(
        {
            "amount": {"value": amount_value, "currency": "RUB"},
            "capture": True,
            "confirmation": {
                "type": "redirect",
                "return_url": f"{settings.FRONTEND_URL}/payment-result?order_id={order.id}",
            },
            "description": f"Оплата заказа №{order.id}",
            "metadata": {"order_id": str(order.id)},
            "receipt": {
                "customer": {"phone": order.recipient_phone or "+79991234567"},
                "items": [{
                    "description": f"Заказ №{order.id}",
                    "quantity": "1.00",
                    "amount": {"value": amount_value, "currency": "RUB"},
                    "vat_code": 1,
                    "payment_subject": "commodity",
                    "payment_mode": "full_payment",
                }],
            },
        },
        str(uuid4()),
    )

    order.payment_id = payment.id
    order.payment_status = payment.status
    order.payment_url = payment.confirmation.confirmation_url
    db.commit()

    return {
        "payment_id": payment.id,
        "status": payment.status,
        "payment_url": payment.confirmation.confirmation_url,
    }


@router.post("/webhook")
async def yookassa_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Webhook YooKassa.

    Проверки:
    1. IP whitelist (в DEBUG режиме можно отключить).
    2. Refetch платежа через API — даже если кто-то подделал тело,
       статус и карточные признаки придут от настоящего YooKassa.
    """

    ip = get_client_ip(request)
    if not settings.DEBUG and not _ip_allowed(ip):
        raise HTTPException(status_code=403, detail="Webhook IP не из whitelist YooKassa")

    data = await request.json()
    payment_object = data.get("object", {}) or {}
    metadata = payment_object.get("metadata") or {}
    order_id = metadata.get("order_id")

    if not order_id:
        return {"ok": True}

    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if not order:
        return {"ok": True}

    payment_id = payment_object.get("id")
    if not payment_id:
        return {"ok": True}

    # Refetch — единственный источник истины
    try:
        verified = Payment.find_one(payment_id)
        verified_data = json.loads(verified.json())
    except Exception:
        # Не валим хук, но и не верим телу
        return {"ok": False, "error": "refetch_failed"}

    # Защита от подмены order_id в metadata
    verified_meta = verified_data.get("metadata") or {}
    if str(verified_meta.get("order_id") or "") != str(order_id):
        raise HTTPException(status_code=400, detail="order_id metadata mismatch")

    order.payment_id = payment_id
    save_yookassa_payment_data(order, verified_data)
    db.flush()

    _run_post_payment_antifraud(db, order)
    db.commit()

    return {"ok": True}


@router.post("/sync/{order_id}")
def sync_payment(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    if not order.payment_id:
        raise HTTPException(status_code=400, detail="У заказа нет payment_id")

    payment = Payment.find_one(order.payment_id)
    payment_data = json.loads(payment.json())

    save_yookassa_payment_data(order, payment_data)
    db.flush()

    af = _run_post_payment_antifraud(db, order)
    db.commit()

    return {
        "order_id": order.id,
        "payment_id": order.payment_id,
        "payment_status": order.payment_status,
        "order_status": order.status,
        "is_paid": order.is_paid,
        "payment_method_id": order.payment_method_id,
        "payment_method_type": order.payment_method_type,
        "card_first6": order.card_first6,
        "card_last4": order.card_last4,
        "card_type": order.card_type,
        "card_issuer_country": order.card_issuer_country,
        "card_issuer_name": order.card_issuer_name,
        "antifraud": af,
    }
