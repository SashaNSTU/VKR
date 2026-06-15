import shutil
import uuid
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from models import User, FraudLog, AntifraudRuleState, Order
from schemas import (
    UserOut,
    AntifraudRuleOut, AntifraudRuleUpdate,
    AntifraudMetricsOut,
)
from auth import get_current_admin
from services.antifraud_config import RULES, all_rules_with_state

router = APIRouter(prefix="/admin", tags=["Администратор"])


# ─── USERS ───────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut])
def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    is_blocked: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    query = db.query(User)
    if is_blocked is not None:
        query = query.filter(User.is_blocked == is_blocked)
    return query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()


@router.patch("/users/{user_id}/block")
def block_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"error": "Пользователь не найден"}
    user.is_blocked = True
    db.commit()
    return {"message": f"Пользователь {user.email} заблокирован"}


@router.patch("/users/{user_id}/unblock")
def unblock_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"error": "Пользователь не найден"}
    user.is_blocked = False
    user.auto_flag_blocked = False
    db.commit()
    return {"message": f"Пользователь {user.email} разблокирован"}


# ─── FRAUD LOGS ──────────────────────────────────────────────────

@router.get("/fraud-logs")
def list_fraud_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    min_score: int = Query(0, ge=0),
    phase: Optional[str] = Query(None),
    rule: Optional[str] = Query(None),
    decision: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    q = db.query(FraudLog).filter(FraudLog.risk_score >= min_score)
    if decision:
        q = q.filter(FraudLog.action_taken == decision)
    if phase:
        q = q.filter(FraudLog.details.like(f'%"phase": "{phase}"%'))
    if rule:
        q = q.filter(FraudLog.triggered_rules.like(f'%"{rule}"%'))

    logs = q.order_by(FraudLog.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for l in logs:
        order = l.order
        user = l.user
        result.append({
            "id": l.id,
            "user_id": l.user_id,
            "user_email": user.email if user else None,
            "order_id": l.order_id,
            "order_status": (order.status.value if order and hasattr(order.status, "value")
                             else str(order.status) if order else None),
            "order_sum": order.final_price if order else None,
            "payment_method": order.payment_method if order else None,
            "payment_status": getattr(order, "payment_status", None) if order else None,
            "card_first6": getattr(order, "card_first6", None) if order else None,
            "card_last4": getattr(order, "card_last4", None) if order else None,
            "card_type": getattr(order, "card_type", None) if order else None,
            "recipient_phone": order.recipient_phone if order else None,
            "delivery_address": order.delivery_address if order else None,
            "device_fingerprint": order.order_device_fp if order else None,
            "fp_hash": order.order_fp_hash if order else None,
            "automation_flags": order.order_automation_flags if order else None,
            "ip": order.order_ip if order else None,
            "risk_score": l.risk_score,
            "triggered_rules": l.triggered_rules,
            "action_taken": l.action_taken,
            "details": l.details,
            "refund_note": (getattr(order, "refund_note", None) if order and l.action_taken == "blocked" else None),
            "created_at": l.created_at,
        })

    return result


# ─── ANTIFRAUD CONFIG ───────────────────────────────────────────

@router.get("/antifraud/rules", response_model=List[AntifraudRuleOut])
def list_antifraud_rules(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Список всех правил с их актуальным состоянием."""
    return all_rules_with_state(db)


@router.patch("/antifraud/rules/{code}", response_model=AntifraudRuleOut)
def update_antifraud_rule(
    code: str,
    data: AntifraudRuleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    Изменить правило (включить/выключить, переопределить вес).

    Позволяет точечно отключать правила и менять их веса без перезапуска сервиса —
    удобно для отладки и оценки чувствительности скоринга.
    """
    if code not in RULES:
        raise HTTPException(status_code=404, detail="Неизвестное правило")

    state = db.query(AntifraudRuleState).filter(AntifraudRuleState.rule_code == code).first()
    if not state:
        state = AntifraudRuleState(rule_code=code, enabled=True)
        db.add(state)

    if data.enabled is not None:
        state.enabled = data.enabled
    if data.score_weight is not None:
        state.score_weight = data.score_weight

    db.commit()
    db.refresh(state)

    meta = RULES[code]
    return AntifraudRuleOut(
        code=code,
        description=meta["description"],
        phase=meta["phase"],
        default_weight=meta["weight"],
        weight=state.score_weight if state.score_weight is not None else meta["weight"],
        enabled=state.enabled,
    )


@router.post("/antifraud/rules/reset")
def reset_antifraud_rules(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Сброс всех правил к дефолтам (enabled=True, weight=default)."""
    db.query(AntifraudRuleState).update({
        AntifraudRuleState.enabled: True,
        AntifraudRuleState.score_weight: None,
    })
    db.commit()
    return {"message": "Все правила сброшены к дефолтам"}


@router.get("/antifraud/metrics", response_model=AntifraudMetricsOut)
def antifraud_metrics(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    Метрики антифрода для итогового отчёта ВКР.

    Возвращает:
    - total_logs            — сколько проверок проведено;
    - by_decision           — распределение approved / review / blocked;
    - by_phase              — pre_payment / post_payment / on_register;
    - by_rule               — сколько раз сработало каждое правило;
    - avg_score             — средний risk_score;
    - blocked_users         — сколько пользователей заблокировано автоматически.
    """
    import json as _json

    logs = db.query(FraudLog).all()
    total = len(logs)

    by_decision = Counter(l.action_taken or "unknown" for l in logs)
    by_rule: Counter = Counter()
    by_phase: Counter = Counter()
    sum_score = 0

    for l in logs:
        sum_score += l.risk_score or 0
        try:
            rules = _json.loads(l.triggered_rules or "[]")
            for r in rules:
                by_rule[r] += 1
        except _json.JSONDecodeError:
            pass
        try:
            details = _json.loads(l.details or "{}")
            phase = details.get("phase", "unknown")
            by_phase[phase] += 1
        except _json.JSONDecodeError:
            pass

    blocked_users = db.query(User).filter(User.is_blocked == True).count()

    return AntifraudMetricsOut(
        total_logs=total,
        by_decision=dict(by_decision),
        by_phase=dict(by_phase),
        by_rule=dict(by_rule),
        avg_score=round(sum_score / total, 2) if total else 0.0,
        blocked_users=blocked_users,
    )


@router.post("/antifraud/reset-data")
def reset_antifraud_data(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    Очистка всех антифрод-данных (для нового прогона BAS-теста в ВКР).

    Удаляет:
    - fraud_logs;
    - user_sessions;
    - снимает auto_flag_blocked / is_blocked с автоматически заблокированных пользователей.

    Заказы и пользователи остаются.
    """
    from models import UserSession
    db.query(FraudLog).delete()
    db.query(UserSession).delete()
    db.query(User).filter(User.auto_flag_blocked == True).update({
        User.is_blocked: False,
        User.auto_flag_blocked: False,
    })
    db.commit()
    return {"message": "Антифрод-данные сброшены"}


# ─── UPLOAD ──────────────────────────────────────────────────────

IMAGES_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "images"


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    _: object = Depends(get_current_admin),
):
    """Загрузка изображения товара"""
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    ext = file.filename.split('.')[-1].lower()
    if ext not in ('jpg', 'jpeg', 'png', 'webp', 'gif'):
        raise HTTPException(400, "Недопустимый формат. Разрешены: jpg, png, webp")
    filename = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    dest = IMAGES_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"url": f"/images/{filename}", "filename": filename}
