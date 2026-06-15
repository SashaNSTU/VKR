import json

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from models import (
    Order, OrderItem, CartItem, Product, PromoCode, PromoUsage,
    OrderStatus, UserSession, SessionEventType, User,
)
from schemas import OrderCreate, OrderOut, OrderStatusUpdate
from auth import get_current_user, get_current_admin
from services.antifraud import check_order_before_payment, apply_pre_payment_decision
from services.http_utils import get_client_ip

router = APIRouter(prefix="/orders", tags=["Заказы"])


@router.post("", response_model=OrderOut, status_code=201)
def create_order(
    data: OrderCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. Корзина
    cart_items = db.query(CartItem).filter(CartItem.user_id == current_user.id).all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Корзина пуста")

    # 2. Наличие + сумма
    total_price = 0.0
    for ci in cart_items:
        product = db.query(Product).filter(Product.id == ci.product_id).first()
        if not product or not product.is_active:
            raise HTTPException(status_code=400, detail=f"Товар {ci.product_id} недоступен")
        if product.stock < ci.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно товара '{product.name}' на складе",
            )
        total_price += product.price * ci.quantity

    total_price = round(total_price, 2)

    # 3. Промокод
    discount_amount = 0.0
    promo_id = None
    if data.promo_code:
        promo = db.query(PromoCode).filter(
            PromoCode.code == data.promo_code.upper(),
            PromoCode.is_active == True,
        ).first()
        if promo:
            already_used = db.query(PromoUsage).filter(
                PromoUsage.promo_id == promo.id,
                PromoUsage.user_id == current_user.id,
            ).first()

            if not already_used:
                if promo.is_first_order_only:
                    prev_orders = db.query(Order).filter(
                        Order.user_id == current_user.id,
                        Order.status.notin_([OrderStatus.cancelled, OrderStatus.fraud_blocked]),
                    ).count()
                    if prev_orders == 0:
                        discount_amount = round(total_price * promo.discount_percent / 100, 2)
                        promo_id = promo.id
                else:
                    discount_amount = round(total_price * promo.discount_percent / 100, 2)
                    promo_id = promo.id

    final_price = round(total_price - discount_amount, 2)

    # 4. Создаём заказ с антифрод-сигналами
    ip = get_client_ip(request)
    ua = data.user_agent or request.headers.get("User-Agent", "")[:500]

    # Объединяем automation_flags + флаг timezone/lang mismatch
    automation_flags = dict(data.automation_flags or {})
    if data.automation_score is not None:
        automation_flags.setdefault("automation_score", data.automation_score)

    order = Order(
        user_id=current_user.id,
        total_price=total_price,
        discount_amount=discount_amount,
        final_price=final_price,
        delivery_address=data.delivery_address,
        delivery_city=data.delivery_city,
        recipient_name=data.recipient_name,
        recipient_phone=data.recipient_phone,
        payment_method=data.payment_method,
        promo_code_id=promo_id,
        # Антифрод-сигналы
        order_ip=ip,
        order_device_fp=data.device_fingerprint,
        order_fp_hash=data.fp_hash,
        order_fp_components=json.dumps(data.fp_components, ensure_ascii=False) if data.fp_components else None,
        order_ua=ua,
        order_user_agent_short=(ua[:120] if ua else None),
        order_timezone=data.timezone,
        order_lang=data.language,
        order_screen=data.screen,
        order_automation_flags=json.dumps(automation_flags, ensure_ascii=False) if automation_flags else None,
        order_time_on_page_ms=data.time_on_page_ms,
        order_form_fill_ms=data.form_fill_ms,
        order_mouse_events=data.mouse_events,
        order_key_events=data.key_events,
        order_touch_events=data.touch_events,
        status=OrderStatus.pending,
    )
    db.add(order)
    db.flush()  # получаем order.id

    # 5. Позиции + склад
    for ci in cart_items:
        product = db.query(Product).filter(Product.id == ci.product_id).first()
        db.add(OrderItem(
            order_id=order.id,
            product_id=ci.product_id,
            quantity=ci.quantity,
            price=product.price,
        ))
        product.stock -= ci.quantity

    # 6. PromoUsage
    if promo_id:
        promo = db.query(PromoCode).filter(PromoCode.id == promo_id).first()
        promo.used_count += 1
        db.add(PromoUsage(
            promo_id=promo_id,
            user_id=current_user.id,
            order_id=order.id,
        ))

    # 7. Очистка корзины
    db.query(CartItem).filter(CartItem.user_id == current_user.id).delete()

    # 8. UserSession (событие 'order')
    db.add(UserSession(
        user_id=current_user.id,
        event_type=SessionEventType.order,
        ip=ip,
        fp_hash=data.fp_hash,
        ua=ua,
        fp_components=json.dumps(data.fp_components, ensure_ascii=False) if data.fp_components else None,
        automation_flags=json.dumps(automation_flags, ensure_ascii=False) if automation_flags else None,
        automation_score=data.automation_score or 0,
        order_id=order.id,
    ))

    db.flush()

    # 9. Pre-payment антифрод
    fraud_result = check_order_before_payment(
        db=db,
        order=order,
        user=current_user,
    )
    apply_pre_payment_decision(order, fraud_result)

    db.commit()
    db.refresh(order)
    return order


@router.get("/my", response_model=List[OrderOut])
def get_my_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc())
        .all()
    )


@router.get("/my/{order_id}", response_model=OrderOut)
def get_my_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(
        Order.id == order_id, Order.user_id == current_user.id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    return order


# ─── Админ-эндпоинты ─────────────────────────────────────────────

@router.get("", response_model=List[OrderOut])
def admin_get_orders(
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)
    return query.order_by(Order.created_at.desc()).offset(skip).limit(limit).all()


@router.patch("/{order_id}/status", response_model=OrderOut)
def admin_update_order_status(
    order_id: int,
    data: OrderStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    order.status = data.status
    db.commit()
    db.refresh(order)
    return order
