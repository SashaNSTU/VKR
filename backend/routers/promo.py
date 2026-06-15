from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from database import get_db
from models import PromoCode, PromoUsage, Order
from schemas import (
    PromoCodeCreate, PromoCodeOut, PromoApplyRequest,
    PromoApplyResponse, MessageResponse
)
from auth import get_current_user, get_current_admin
from models import User

router = APIRouter(prefix="/promo", tags=["Промокоды"])


def _get_active_promo(code: str, db: Session) -> PromoCode:
    promo = db.query(PromoCode).filter(
        PromoCode.code == code.upper(),
        PromoCode.is_active == True,
    ).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Промокод не найден или неактивен")
    if promo.expires_at and promo.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Срок действия промокода истёк")
    if promo.max_uses and promo.used_count >= promo.max_uses:
        raise HTTPException(status_code=400, detail="Промокод исчерпал лимит использований")
    return promo


@router.post("/apply", response_model=PromoApplyResponse)
def apply_promo(
    data: PromoApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    promo = _get_active_promo(data.code, db)

    # Проверка: только для первого заказа
    if promo.is_first_order_only:
        has_orders = db.query(Order).filter(
            Order.user_id == current_user.id,
            Order.status.notin_(["cancelled", "fraud_blocked"]),
        ).count()
        if has_orders > 0:
            return PromoApplyResponse(
                valid=False,
                message="Этот промокод действует только для первого заказа",
            )

    # Проверка: использован ли уже этим пользователем
    already_used = db.query(PromoUsage).filter(
        PromoUsage.promo_id == promo.id,
        PromoUsage.user_id == current_user.id,
    ).first()
    if already_used:
        return PromoApplyResponse(
            valid=False,
            message="Вы уже использовали этот промокод",
        )

    discount_amount = round(data.cart_total * promo.discount_percent / 100, 2)
    final_total = round(data.cart_total - discount_amount, 2)

    return PromoApplyResponse(
        valid=True,
        discount_percent=promo.discount_percent,
        discount_amount=discount_amount,
        final_total=final_total,
        message=f"Промокод применён: скидка {promo.discount_percent:.0f}%",
        promo_id=promo.id,
    )


# ─── Админ-эндпоинты ─────────────────────────────────────────────

@router.get("", response_model=list[PromoCodeOut])
def list_promos(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    return db.query(PromoCode).all()


@router.post("", response_model=PromoCodeOut, status_code=201)
def create_promo(
    data: PromoCodeCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    existing = db.query(PromoCode).filter(PromoCode.code == data.code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Промокод уже существует")

    promo = PromoCode(**data.model_dump())
    promo.code = promo.code.upper()
    db.add(promo)
    db.commit()
    db.refresh(promo)
    return promo


@router.patch("/{promo_id}/deactivate", response_model=MessageResponse)
def deactivate_promo(
    promo_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    promo = db.query(PromoCode).filter(PromoCode.id == promo_id).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Промокод не найден")
    promo.is_active = False
    db.commit()
    return MessageResponse(message="Промокод деактивирован")
