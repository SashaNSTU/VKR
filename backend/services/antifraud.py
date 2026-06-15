"""
Антифрод-модуль.

Архитектура:
- Каждое правило проверяет, включено ли оно в `antifraud_config.is_rule_enabled`;
  если выключено — пропускается и не пишется в reasons (только в details).
- Вес каждого сработавшего правила берётся из `antifraud_config.rule_weight`.
- Итоговое решение берётся из THRESHOLDS, тоже из конфига.

Это позволяет администратору отключать правила без перезапуска
и оценивать вклад каждого правила в обнаружение конкретного сценария атаки.

Фазы:
- on_register   — velocity-проверки на этапе регистрации;
- pre_payment   — проверки при создании заказа, до оплаты;
- post_payment  — проверки после успешного платежа,
                   когда YooKassa вернула карточные признаки.
"""

import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from models import (
    Order,
    User,
    FraudLog,
    OrderStatus,
    PromoCode,
    UserSession,
    SessionEventType,
)
from services.antifraud_config import (
    RULES,
    VELOCITY_WINDOWS,
    THRESHOLDS,
    is_rule_enabled,
    rule_weight,
)


# ─────────────────────────────────────────────────────────────
# Общие функции
# ─────────────────────────────────────────────────────────────

def calculate_decision(score: int) -> str:
    """Pre-payment решение по итоговому скору."""
    if score >= THRESHOLDS["pre_payment_block"]:
        return "blocked"
    if score >= THRESHOLDS["pre_payment_review"]:
        return "review"
    return "approved"


def calculate_post_payment_decision(score: int) -> str:
    """Post-payment решение по итоговому скору."""
    if score >= THRESHOLDS["post_payment_review"]:
        return "review"
    return "approved"


def save_fraud_log(
    db: Session,
    user_id: int | None,
    order_id: int | None,
    score: int,
    decision: str,
    reasons: list[str],
    details: dict,
):
    fraud_log = FraudLog(
        user_id=user_id,
        order_id=order_id,
        risk_score=score,
        triggered_rules=json.dumps(reasons, ensure_ascii=False),
        action_taken=decision,
        details=json.dumps(details, ensure_ascii=False),
    )
    db.add(fraud_log)


def _apply_rule(
    db: Session,
    code: str,
    triggered: bool,
    score_ref: list[int],
    reasons: list[str],
    details: dict,
) -> bool:
    """
    Унифицированный применятор правила.

    Возвращает True, если правило было засчитано.
    Если правило отключено в конфиге — не засчитывается, но в details пишется
    'rule_disabled:<code>' = True (полезно для разбора в админке/ВКР).
    """
    if not triggered:
        return False

    if not is_rule_enabled(db, code):
        details[f"rule_disabled:{code}"] = True
        return False

    score_ref[0] += rule_weight(db, code)
    reasons.append(code)
    return True


# ─────────────────────────────────────────────────────────────
# ON-REGISTER ANTIFRAUD (velocity)
# ─────────────────────────────────────────────────────────────

def check_registration(
    db: Session,
    user: User,
    ip: str | None,
    fp_hash: str | None,
    ua: str | None,
    fp_components_json: str | None,
    automation_flags: dict | None,
    automation_score: int = 0,
) -> dict:
    """
    Проверки при регистрации.

    Логика:
    - всегда записываем сессию в user_sessions (она нужна последующим velocity-проверкам);
    - считаем velocity по IP и FP;
    - если score >= block — выставляем user.is_blocked + auto_flag_blocked.

    Не используем FraudLog без order_id для регистрации? — Используем:
    в FraudLog для регистрации order_id=NULL.
    Это даёт админу единое окно событий.
    """

    # Сначала пишем сессию (фиксируем сам факт)
    session_row = UserSession(
        user_id=user.id,
        event_type=SessionEventType.register,
        ip=ip,
        fp_hash=fp_hash,
        ua=ua,
        fp_components=fp_components_json,
        automation_flags=json.dumps(automation_flags, ensure_ascii=False) if automation_flags else None,
        automation_score=automation_score,
    )
    db.add(session_row)
    db.flush()

    score_ref = [0]
    reasons: list[str] = []
    details: dict = {
        "phase": "on_register",
        "ip": ip,
        "fp_hash": fp_hash,
        "automation_score": automation_score,
    }

    now = datetime.utcnow()

    # ── VELOCITY_IP_REGISTRATIONS ──
    if ip:
        window = VELOCITY_WINDOWS["VELOCITY_IP_REGISTRATIONS"]
        since = now - timedelta(minutes=window["window_minutes"])

        count = (
            db.query(UserSession)
            .filter(UserSession.event_type == SessionEventType.register)
            .filter(UserSession.ip == ip)
            .filter(UserSession.created_at >= since)
            .filter(UserSession.user_id != user.id)
            .count()
        )

        details["ip_registrations_window"] = count
        details["ip_registrations_threshold"] = window["threshold"]

        _apply_rule(
            db, "VELOCITY_IP_REGISTRATIONS",
            triggered=count >= window["threshold"],
            score_ref=score_ref, reasons=reasons, details=details,
        )

    # ── VELOCITY_FP_REGISTRATIONS ──
    if fp_hash:
        window = VELOCITY_WINDOWS["VELOCITY_FP_REGISTRATIONS"]
        since = now - timedelta(minutes=window["window_minutes"])

        count = (
            db.query(UserSession)
            .filter(UserSession.event_type == SessionEventType.register)
            .filter(UserSession.fp_hash == fp_hash)
            .filter(UserSession.created_at >= since)
            .filter(UserSession.user_id != user.id)
            .count()
        )

        details["fp_registrations_window"] = count
        details["fp_registrations_threshold"] = window["threshold"]

        _apply_rule(
            db, "VELOCITY_FP_REGISTRATIONS",
            triggered=count >= window["threshold"],
            score_ref=score_ref, reasons=reasons, details=details,
        )

    # ── BAS_AUTOMATION_DETECTED ──
    # На регистрации тоже учитываем — та же комбинированная логика, что и в pre_payment.
    _af = automation_flags or {}
    _reg_webdriver      = bool(_af.get("webdriver"))
    _reg_cdc_keys       = bool(_af.get("cdc_keys_present"))
    _reg_webgl_headless = (bool(_af.get("webgl_swiftshader")) or
                           bool(_af.get("webgl_llvmpipe")) or
                           bool(_af.get("webgl_unavailable")))
    _reg_no_plugins     = bool(_af.get("no_plugins"))
    _reg_no_runtime     = bool(_af.get("ua_chrome_without_chrome_runtime"))
    # На регистрации поведенческих данных нет, поэтому только сильные сигналы
    # и комбо двух слабых. Слабый сигнал в одиночку даёт false positives.
    reg_automation_detected = (
        automation_score >= 40 or
        _reg_webdriver or
        _reg_cdc_keys or
        _reg_webgl_headless or
        (_reg_no_plugins and _reg_no_runtime)
    )
    details["automation_detected_reason"] = (
        "score" if automation_score >= 40 else
        "webdriver" if _reg_webdriver else
        "cdc_keys" if _reg_cdc_keys else
        "webgl_headless" if _reg_webgl_headless else
        "no_plugins+no_runtime" if (_reg_no_plugins and _reg_no_runtime) else
        "none"
    )
    _apply_rule(
        db, "BAS_AUTOMATION_DETECTED",
        triggered=reg_automation_detected,
        score_ref=score_ref, reasons=reasons, details=details,
    )

    score = score_ref[0]
    decision = calculate_decision(score)

    if decision == "blocked":
        user.is_blocked = True
        user.auto_flag_blocked = True

    save_fraud_log(
        db=db, user_id=user.id, order_id=None,
        score=score, decision=decision, reasons=reasons, details=details,
    )

    return {"score": score, "decision": decision, "reasons": reasons, "details": details}


# ─────────────────────────────────────────────────────────────
# PRE-PAYMENT ANTIFRAUD (promo + behavioral + velocity)
# ─────────────────────────────────────────────────────────────

def check_order_before_payment(
    db: Session,
    order: Order,
    user: User,
) -> dict:
    """Pre-payment проверки заказа."""

    score_ref = [0]
    reasons: list[str] = []
    details: dict = {"phase": "pre_payment"}

    has_promo = order.promo_code_id is not None or (order.discount_amount or 0) > 0
    is_first_order_promo = bool(order.promo_code and order.promo_code.is_first_order_only)

    automation_flags = {}
    if order.order_automation_flags:
        try:
            automation_flags = json.loads(order.order_automation_flags)
        except json.JSONDecodeError:
            automation_flags = {}

    details["has_promo"] = has_promo
    details["is_first_order_promo"] = is_first_order_promo
    details["automation_flags"] = automation_flags

    # ─────────────────────────────────────────────
    # AUTOMATION / BEHAVIORAL — работают всегда
    # ─────────────────────────────────────────────

    automation_score = int(automation_flags.get("automation_score") or 0)
    details["client_automation_score"] = automation_score

    # BAS_AUTOMATION_DETECTED — чисто fingerprint-правило (device intelligence layer).
    # Поведенческое палево ловят отдельные правила: FORM_FILLED_TOO_FAST и
    # NO_HUMAN_INPUT_SIGNALS. Такое разделение даёт чистоту проверки:
    # каждое правило отвечает за свой класс признаков.
    _webdriver      = bool(automation_flags.get("webdriver"))
    _cdc_keys       = bool(automation_flags.get("cdc_keys_present"))
    _webgl_headless = (bool(automation_flags.get("webgl_swiftshader")) or
                       bool(automation_flags.get("webgl_llvmpipe")) or
                       bool(automation_flags.get("webgl_unavailable")))
    _no_plugins     = bool(automation_flags.get("no_plugins"))
    _no_runtime     = bool(automation_flags.get("ua_chrome_without_chrome_runtime"))

    automation_detected = (
        automation_score >= 40 or          # сильный суммарный скор
        _webdriver or                      # явный WebDriver
        _cdc_keys or                       # Selenium CDC-ключи
        _webgl_headless or                 # headless WebGL
        (_no_plugins and _no_runtime)      # два слабых fingerprint-сигнала вместе
    )
    details["automation_detected_reason"] = (
        "score" if automation_score >= 40 else
        "webdriver" if _webdriver else
        "cdc_keys" if _cdc_keys else
        "webgl_headless" if _webgl_headless else
        "no_plugins+no_runtime" if (_no_plugins and _no_runtime) else
        "none"
    )
    _apply_rule(
        db, "BAS_AUTOMATION_DETECTED",
        triggered=automation_detected,
        score_ref=score_ref, reasons=reasons, details=details,
    )

    # Слишком быстрое заполнение формы.
    # form_fill_ms=None означает, что BAS не вызвал ни одного input/keydown события
    # (прямое присвоение element.value не создаёт события DOM).
    # В этом случае используем time_on_page_ms как замену — если страница открыта
    # меньше 3 секунд и ни одного ввода не было, это тоже подозрительно.
    form_fill_ms_raw = order.order_form_fill_ms
    time_on_page_ms = order.order_time_on_page_ms or 0
    form_fill_ms = form_fill_ms_raw if form_fill_ms_raw is not None else 0
    details["form_fill_ms"] = form_fill_ms
    details["time_on_page_ms"] = time_on_page_ms
    _apply_rule(
        db, "FORM_FILLED_TOO_FAST",
        triggered=(
            (form_fill_ms > 0 and form_fill_ms < 3000) or
            (form_fill_ms_raw is None and 0 < time_on_page_ms < 3000)
        ),
        score_ref=score_ref, reasons=reasons, details=details,
    )

    # Полное отсутствие пользовательских событий.
    # Порог 100 мс: BAS обрабатывает заказ за ~250-400 мс, и 100 мс достаточно
    # чтобы отсечь мгновенные программные редиректы.
    human_events = (order.order_mouse_events or 0) + (order.order_key_events or 0) + (order.order_touch_events or 0)
    details["human_events_total"] = human_events
    _apply_rule(
        db, "NO_HUMAN_INPUT_SIGNALS",
        triggered=time_on_page_ms > 100 and human_events == 0,
        score_ref=score_ref, reasons=reasons, details=details,
    )

    # Часовой пояс ↔ язык mismatch (грубо, по подсказке клиента)
    tz_mismatch = bool(automation_flags.get("timezone_lang_mismatch"))
    _apply_rule(
        db, "FP_TIMEZONE_LANG_MISMATCH",
        triggered=tz_mismatch,
        score_ref=score_ref, reasons=reasons, details=details,
    )

    # FP принадлежит уже заблокированному ранее пользователю
    if order.order_fp_hash:
        blocked_owner = (
            db.query(User)
            .filter(User.registered_fp_hash == order.order_fp_hash)
            .filter(User.is_blocked == True)
            .filter(User.id != user.id)
            .first()
        )
        details["fp_belongs_to_blocked_user"] = bool(blocked_owner)
        _apply_rule(
            db, "FP_BELONGS_TO_BLOCKED_USER",
            triggered=bool(blocked_owner),
            score_ref=score_ref, reasons=reasons, details=details,
        )

    # ─────────────────────────────────────────────
    # VELOCITY ORDERS
    # ─────────────────────────────────────────────

    now = datetime.utcnow()

    if order.order_ip:
        window = VELOCITY_WINDOWS["VELOCITY_IP_ORDERS"]
        since = now - timedelta(minutes=window["window_minutes"])

        count = (
            db.query(Order)
            .filter(Order.order_ip == order.order_ip)
            .filter(Order.id != order.id)
            .filter(Order.created_at >= since)
            .count()
        )

        details["ip_orders_window"] = count
        details["ip_orders_threshold"] = window["threshold"]

        _apply_rule(
            db, "VELOCITY_IP_ORDERS",
            triggered=count >= window["threshold"],
            score_ref=score_ref, reasons=reasons, details=details,
        )

    if order.order_fp_hash:
        window = VELOCITY_WINDOWS["VELOCITY_FP_ORDERS"]
        since = now - timedelta(minutes=window["window_minutes"])

        count = (
            db.query(Order)
            .filter(Order.order_fp_hash == order.order_fp_hash)
            .filter(Order.id != order.id)
            .filter(Order.created_at >= since)
            .count()
        )

        details["fp_orders_window"] = count
        details["fp_orders_threshold"] = window["threshold"]

        _apply_rule(
            db, "VELOCITY_FP_ORDERS",
            triggered=count >= window["threshold"],
            score_ref=score_ref, reasons=reasons, details=details,
        )

    # ─────────────────────────────────────────────
    # PROMO-ПРАВИЛА — только если у заказа есть промо-выгода
    # ─────────────────────────────────────────────

    if not has_promo:
        score = score_ref[0]
        decision = calculate_decision(score)
        save_fraud_log(
            db=db, user_id=user.id, order_id=order.id,
            score=score, decision=decision, reasons=reasons, details=details,
        )
        return {"score": score, "decision": decision, "reasons": reasons, "details": details}

    # PROMO_DEVICE_MULTIACCOUNT — берём по order_fp_hash (стабильный hash настоящего fp).
    # Дополнительно фоллбек на старое поле order_device_fp на случай отсутствия fp_hash.
    if order.order_fp_hash:
        device_users_count = (
            db.query(Order.user_id)
            .filter(Order.order_fp_hash == order.order_fp_hash)
            .filter(Order.promo_code_id.isnot(None))
            .filter(Order.user_id != user.id)
            .distinct()
            .count()
        )
    elif order.order_device_fp:
        device_users_count = (
            db.query(Order.user_id)
            .filter(Order.order_device_fp == order.order_device_fp)
            .filter(Order.promo_code_id.isnot(None))
            .filter(Order.user_id != user.id)
            .distinct()
            .count()
        )
    else:
        device_users_count = 0

    details["device_users_with_promo"] = device_users_count
    _apply_rule(
        db, "PROMO_DEVICE_MULTIACCOUNT",
        triggered=device_users_count >= 2,
        score_ref=score_ref, reasons=reasons, details=details,
    )

    # PROMO_PHONE_MULTIACCOUNT
    phone_users_count = 0
    if order.recipient_phone:
        phone_users_count = (
            db.query(Order.user_id)
            .filter(Order.recipient_phone == order.recipient_phone)
            .filter(Order.promo_code_id.isnot(None))
            .filter(Order.user_id != user.id)
            .distinct()
            .count()
        )
    details["phone_users_with_promo"] = phone_users_count
    _apply_rule(
        db, "PROMO_PHONE_MULTIACCOUNT",
        triggered=phone_users_count >= 1,
        score_ref=score_ref, reasons=reasons, details=details,
    )

    # PROMO_ADDRESS_MULTIACCOUNT
    address_users_count = 0
    if order.delivery_address:
        address_users_count = (
            db.query(Order.user_id)
            .filter(Order.delivery_address == order.delivery_address)
            .filter(Order.promo_code_id.isnot(None))
            .filter(Order.user_id != user.id)
            .distinct()
            .count()
        )
    details["address_users_with_promo"] = address_users_count
    _apply_rule(
        db, "PROMO_ADDRESS_MULTIACCOUNT",
        triggered=address_users_count >= 2,
        score_ref=score_ref, reasons=reasons, details=details,
    )

    # HIGH_VALUE_PROMO_NEW_USER
    user_previous_orders_count = (
        db.query(Order)
        .filter(Order.user_id == user.id)
        .filter(Order.id != order.id)
        .count()
    )
    details["user_previous_orders_count"] = user_previous_orders_count
    _apply_rule(
        db, "HIGH_VALUE_PROMO_NEW_USER",
        triggered=user_previous_orders_count == 0 and order.final_price >= 100000,
        score_ref=score_ref, reasons=reasons, details=details,
    )

    # PROMO_IP_BURST
    # Локалхост не считаем сильным признаком: для BAS-теста нужно гонять с тестовых IP.
    if order.order_ip:
        ip_users_count = (
            db.query(Order.user_id)
            .filter(Order.order_ip == order.order_ip)
            .filter(Order.promo_code_id.isnot(None))
            .filter(Order.id != order.id)
            .distinct()
            .count()
        )
        details["ip_users_with_promo"] = ip_users_count
        is_local_ip = order.order_ip in ("127.0.0.1", "::1", "localhost")
        details["is_local_ip"] = is_local_ip
        _apply_rule(
            db, "PROMO_IP_BURST",
            triggered=(not is_local_ip) and ip_users_count >= 3,
            score_ref=score_ref, reasons=reasons, details=details,
        )

    # FIRST_ORDER_PROMO_REPEAT
    if is_first_order_promo:
        linked_users: set = set()
        linked_order_ids: list = []

        base_q = (
            db.query(Order)
            .join(PromoCode, Order.promo_code_id == PromoCode.id)
            .filter(PromoCode.is_first_order_only == True)
            .filter(Order.id != order.id)
            .filter(Order.user_id != user.id)
        )

        fp_to_match = order.order_fp_hash or order.order_device_fp
        if fp_to_match:
            fp_col = Order.order_fp_hash if order.order_fp_hash else Order.order_device_fp
            for o in base_q.filter(fp_col == fp_to_match).all():
                linked_users.add(o.user_id)
                linked_order_ids.append(o.id)

        if order.recipient_phone:
            for o in base_q.filter(Order.recipient_phone == order.recipient_phone).all():
                linked_users.add(o.user_id)
                linked_order_ids.append(o.id)

        if order.delivery_address:
            for o in base_q.filter(Order.delivery_address == order.delivery_address).all():
                linked_users.add(o.user_id)
                linked_order_ids.append(o.id)

        details["first_order_linked_users_count"] = len(linked_users)
        details["first_order_linked_order_ids"] = list(set(linked_order_ids))

        _apply_rule(
            db, "FIRST_ORDER_PROMO_REPEAT",
            triggered=len(linked_users) >= 1,
            score_ref=score_ref, reasons=reasons, details=details,
        )

    score = score_ref[0]
    decision = calculate_decision(score)

    save_fraud_log(
        db=db, user_id=user.id, order_id=order.id,
        score=score, decision=decision, reasons=reasons, details=details,
    )

    return {"score": score, "decision": decision, "reasons": reasons, "details": details}


def apply_pre_payment_decision(order: Order, fraud_result: dict):
    """Меняет статус заказа по результатам pre-payment."""
    decision = fraud_result["decision"]
    if decision == "blocked":
        order.status = OrderStatus.fraud_blocked
    elif decision == "review":
        order.status = OrderStatus.pending_review
    else:
        order.status = OrderStatus.pending


# ─────────────────────────────────────────────────────────────
# POST-PAYMENT ANTIFRAUD
# ─────────────────────────────────────────────────────────────

def get_card_signature(order: Order) -> str | None:
    if not order.card_first6 or not order.card_last4:
        return None
    parts = [
        order.card_first6,
        order.card_last4,
        order.card_type or "",
        order.card_issuer_country or "",
    ]
    return "|".join(parts)


def base_same_card_promo_query(db: Session, order: Order):
    return (
        db.query(Order)
        .filter(Order.id != order.id)
        .filter(Order.user_id != order.user_id)
        .filter(Order.promo_code_id.isnot(None))
        .filter(Order.payment_status == "succeeded")
        .filter(Order.card_first6 == order.card_first6)
        .filter(Order.card_last4 == order.card_last4)
        .filter(Order.card_type == order.card_type)
        .filter(Order.card_issuer_country == order.card_issuer_country)
    )


def check_order_after_payment(
    db: Session,
    order: Order,
    user: User,
    lookback_days: int = 30,
) -> dict:
    """Post-payment проверки. Карточные мультиаккаунт-правила."""

    score_ref = [0]
    reasons: list[str] = []
    details: dict = {"phase": "post_payment_promo", "lookback_days": lookback_days}

    has_promo = order.promo_code_id is not None or (order.discount_amount or 0) > 0
    is_first_order_promo = bool(order.promo_code and order.promo_code.is_first_order_only)
    card_signature = get_card_signature(order)

    details["has_promo"] = has_promo
    details["is_first_order_promo"] = is_first_order_promo
    details["card_signature"] = card_signature
    details["payment_method_type"] = order.payment_method_type

    if not has_promo or not card_signature:
        return {"score": 0, "decision": "approved", "reasons": [], "details": details}

    same_card_q = base_same_card_promo_query(db, order)
    same_card_orders = same_card_q.all()
    same_card_users_count = len({o.user_id for o in same_card_orders})

    details["same_card_promo_orders_count"] = len(same_card_orders)
    details["same_card_promo_users_count"] = same_card_users_count

    # FIRST_ORDER_PROMO_CARD_REPEAT
    first_order_card_users_count = 0
    if is_first_order_promo:
        first_order_card_orders = (
            same_card_q
            .join(PromoCode, Order.promo_code_id == PromoCode.id)
            .filter(PromoCode.is_first_order_only == True)
            .all()
        )
        first_order_card_users_count = len({o.user_id for o in first_order_card_orders})

        details["first_order_card_orders_count"] = len(first_order_card_orders)
        details["first_order_card_users_count"] = first_order_card_users_count

        _apply_rule(
            db, "FIRST_ORDER_PROMO_CARD_REPEAT",
            triggered=first_order_card_users_count >= 1,
            score_ref=score_ref, reasons=reasons, details=details,
        )

    # PROMO_CARD_MULTIACCOUNT — не дублируем поверх first-order
    if "FIRST_ORDER_PROMO_CARD_REPEAT" not in reasons:
        _apply_rule(
            db, "PROMO_CARD_MULTIACCOUNT",
            triggered=same_card_users_count >= 1,
            score_ref=score_ref, reasons=reasons, details=details,
        )

    # PROMO_CARD_PHONE_LINK
    if order.recipient_phone:
        card_phone_users_count = len({
            o.user_id for o in same_card_q.filter(Order.recipient_phone == order.recipient_phone).all()
        })
        details["card_phone_users_count"] = card_phone_users_count
        _apply_rule(
            db, "PROMO_CARD_PHONE_LINK",
            triggered=card_phone_users_count >= 1,
            score_ref=score_ref, reasons=reasons, details=details,
        )

    # PROMO_CARD_ADDRESS_LINK
    if order.delivery_address:
        card_addr_users_count = len({
            o.user_id for o in same_card_q.filter(Order.delivery_address == order.delivery_address).all()
        })
        details["card_address_users_count"] = card_addr_users_count
        _apply_rule(
            db, "PROMO_CARD_ADDRESS_LINK",
            triggered=card_addr_users_count >= 1,
            score_ref=score_ref, reasons=reasons, details=details,
        )

    # PROMO_CARD_DEVICE_LINK — fp_hash приоритетнее, чем legacy device_fp
    fp_to_match = order.order_fp_hash or order.order_device_fp
    if fp_to_match:
        fp_col = Order.order_fp_hash if order.order_fp_hash else Order.order_device_fp
        since = datetime.utcnow() - timedelta(days=lookback_days)
        card_device_users_count = len({
            o.user_id for o in same_card_q
                .filter(fp_col == fp_to_match)
                .filter(Order.created_at >= since)
                .all()
        })
        details["card_device_users_count"] = card_device_users_count
        _apply_rule(
            db, "PROMO_CARD_DEVICE_LINK",
            triggered=card_device_users_count >= 1,
            score_ref=score_ref, reasons=reasons, details=details,
        )

    post_score = score_ref[0]

    # Ищем pre_payment score для этого заказа, чтобы combined score не снижался после оплаты
    pre_log = (
        db.query(FraudLog)
        .filter(FraudLog.order_id == order.id)
        .filter(FraudLog.details.like('%"phase": "pre_payment"%'))
        .first()
    )
    pre_payment_score = pre_log.risk_score if pre_log else 0
    combined_score = pre_payment_score + post_score

    details["pre_payment_score"] = pre_payment_score
    details["post_payment_score"] = post_score
    details["combined_score"] = combined_score

    # Логика решения:
    # - block: combined_score дотянул до pre_payment_block (комбинация pre+post)
    # - review: либо combined дотянул до pre_payment_review,
    #           либо post_score сам по себе >= post_payment_review
    #           (это ключевой кейс сценария H — карточный мультиаккаунтинг,
    #            где pre_payment_score=0, а одного FIRST_ORDER_PROMO_CARD_REPEAT
    #            достаточно чтобы отправить заказ на ручную проверку)
    if combined_score >= THRESHOLDS["pre_payment_block"]:
        decision = "blocked"
        order.status = OrderStatus.fraud_blocked
        order.refund_note = (
            "Ваш платёж получен, однако заказ заблокирован системой защиты от мошенничества. "
            "Возврат средств будет произведён в течение 24 часов."
        )
    elif (combined_score >= THRESHOLDS["pre_payment_review"]
          or post_score >= THRESHOLDS["post_payment_review"]):
        decision = "review"
        order.status = OrderStatus.pending_review
    else:
        decision = "approved"

    score = combined_score

    # Защита от дублей при многократном sync
    existing_log = (
        db.query(FraudLog)
        .filter(FraudLog.order_id == order.id)
        .filter(FraudLog.details.like('%"phase": "post_payment_promo"%'))
        .first()
    )

    if existing_log:
        existing_log.risk_score = score
        existing_log.triggered_rules = json.dumps(reasons, ensure_ascii=False)
        existing_log.action_taken = decision
        existing_log.details = json.dumps(details, ensure_ascii=False)
    else:
        save_fraud_log(
            db=db, user_id=user.id, order_id=order.id,
            score=score, decision=decision, reasons=reasons, details=details,
        )

    return {"score": score, "decision": decision, "reasons": reasons, "details": details}
