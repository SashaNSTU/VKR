"""
Конфигурация антифрод-правил.

Каждое правило имеет:
- code        — уникальный идентификатор;
- description — пояснение для UI;
- weight      — score, который правило прибавляет при срабатывании;
- phase       — pre_payment / post_payment / on_register / on_login;
- enabled     — включено ли (хранится в БД, можно переключить в админке).

Это центральный реестр правил. Все правила в services/antifraud.py
обращаются сюда через get_rule(code) и выполняются только если правило enabled=True.

Динамическое управление правилами даёт возможность:
- последовательно отключать правила без перезапуска сервиса;
- замерять, как меняется детектируемость BAS-сценариев;
- оценивать вклад каждого правила в общий скор.
"""

from sqlalchemy.orm import sessionmaker, Session
from models import AntifraudRuleState


# ─────────────────────────────────────────────────────────────
# Реестр правил
# ─────────────────────────────────────────────────────────────

RULES = {
    # ── PRE-PAYMENT PROMO ──
    "PROMO_DEVICE_MULTIACCOUNT": {
        "description": "Одно устройство используется разными аккаунтами для промо-заказов",
        "weight": 35,
        "phase": "pre_payment",
    },
    "PROMO_PHONE_MULTIACCOUNT": {
        "description": "Один телефон получателя у промо-заказов разных аккаунтов",
        "weight": 30,
        "phase": "pre_payment",
    },
    "PROMO_ADDRESS_MULTIACCOUNT": {
        "description": "Один адрес доставки у промо-заказов разных аккаунтов",
        "weight": 25,
        "phase": "pre_payment",
    },
    "HIGH_VALUE_PROMO_NEW_USER": {
        "description": "Новый аккаунт оформляет дорогой заказ с промокодом",
        "weight": 20,
        "phase": "pre_payment",
    },
    "PROMO_IP_BURST": {
        "description": "С одного IP много промо-заказов разных аккаунтов",
        "weight": 25,
        "phase": "pre_payment",
    },
    "FIRST_ORDER_PROMO_REPEAT": {
        "description": "Повторное использование first-order промо на тех же fp/телефоне/адресе",
        "weight": 40,
        "phase": "pre_payment",
    },

    # ── PRE-PAYMENT BEHAVIORAL / AUTOMATION ──
    "BAS_AUTOMATION_DETECTED": {
        "description": "Клиент сообщил автоматизацию (webdriver / headless / отсутствие WebGL и т.п.)",
        "weight": 50,
        "phase": "pre_payment",
    },
    "FORM_FILLED_TOO_FAST": {
        "description": "Чекаут заполнен подозрительно быстро (< 3 секунд)",
        "weight": 25,
        "phase": "pre_payment",
    },
    "NO_HUMAN_INPUT_SIGNALS": {
        "description": "На странице чекаута нет ни одного mouse/touch/key события",
        "weight": 30,
        "phase": "pre_payment",
    },
    "FP_TIMEZONE_LANG_MISMATCH": {
        "description": "Подозрительное несоответствие timezone и языка",
        "weight": 15,
        "phase": "pre_payment",
    },

    # ── PRE-PAYMENT VELOCITY ──
    "VELOCITY_IP_REGISTRATIONS": {
        "description": "Слишком много регистраций с одного IP за окно времени",
        "weight": 40,
        "phase": "on_register",
    },
    "VELOCITY_FP_REGISTRATIONS": {
        "description": "Слишком много регистраций с одного fingerprint за окно времени",
        "weight": 45,
        "phase": "on_register",
    },
    "VELOCITY_IP_ORDERS": {
        "description": "Слишком много заказов с одного IP за короткое время",
        "weight": 35,
        "phase": "pre_payment",
    },
    "VELOCITY_FP_ORDERS": {
        "description": "Слишком много заказов с одного fingerprint за короткое время",
        "weight": 40,
        "phase": "pre_payment",
    },
    "FP_BELONGS_TO_BLOCKED_USER": {
        "description": "Этот fingerprint уже принадлежал заблокированному пользователю",
        "weight": 50,
        "phase": "pre_payment",
    },

    # ── POST-PAYMENT ──
    "FIRST_ORDER_PROMO_CARD_REPEAT": {
        "description": "Та же карта использовалась для нескольких first-order промо",
        "weight": 40,
        "phase": "post_payment",
    },
    "PROMO_CARD_MULTIACCOUNT": {
        "description": "Та же карта в промо-заказах разных аккаунтов",
        "weight": 30,
        "phase": "post_payment",
    },
    "PROMO_CARD_PHONE_LINK": {
        "description": "Карта + телефон совпадают у промо-заказов разных аккаунтов",
        "weight": 35,
        "phase": "post_payment",
    },
    "PROMO_CARD_ADDRESS_LINK": {
        "description": "Карта + адрес совпадают у промо-заказов разных аккаунтов",
        "weight": 30,
        "phase": "post_payment",
    },
    "PROMO_CARD_DEVICE_LINK": {
        "description": "Карта + устройство совпадают у промо-заказов разных аккаунтов",
        "weight": 35,
        "phase": "post_payment",
    },
}


# ─────────────────────────────────────────────────────────────
# Velocity-параметры
# Окно и порог считаются явно — это упрощает их подстройку
# в ВКР и понимание ревьюером.
# ─────────────────────────────────────────────────────────────

VELOCITY_WINDOWS = {
    "VELOCITY_IP_REGISTRATIONS": {"window_minutes": 60,  "threshold": 3},
    "VELOCITY_FP_REGISTRATIONS": {"window_minutes": 1440, "threshold": 2},
    "VELOCITY_IP_ORDERS":        {"window_minutes": 60,  "threshold": 5},
    "VELOCITY_FP_ORDERS":        {"window_minutes": 60,  "threshold": 3},
}


# ─────────────────────────────────────────────────────────────
# Декомпозируем boundary решений (можно крутить из админки в будущем)
# ─────────────────────────────────────────────────────────────

THRESHOLDS = {
    "pre_payment_review":  70,
    "pre_payment_block":   100,
    "post_payment_review": 40,
}


# ─────────────────────────────────────────────────────────────
# Сидинг таблицы AntifraudRuleState при первом запуске
# ─────────────────────────────────────────────────────────────

def seed_rule_state(session_factory):
    """Заполняет таблицу AntifraudRuleState значениями по умолчанию."""
    db: Session = session_factory()
    try:
        existing = {r.rule_code for r in db.query(AntifraudRuleState).all()}
        for code in RULES:
            if code in existing:
                continue
            db.add(AntifraudRuleState(rule_code=code, enabled=True))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"⚠️  seed_rule_state: {e}")
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────
# Утилиты для антифрод-правил
# ─────────────────────────────────────────────────────────────

def is_rule_enabled(db: Session, code: str) -> bool:
    """Включено ли правило по данным БД (с фоллбеком на дефолт)."""
    state = db.query(AntifraudRuleState).filter(AntifraudRuleState.rule_code == code).first()
    if state is None:
        return True
    return bool(state.enabled)


def rule_weight(db: Session, code: str) -> int:
    """Вес правила: либо переопределение из БД, либо дефолт."""
    state = db.query(AntifraudRuleState).filter(AntifraudRuleState.rule_code == code).first()
    if state and state.score_weight is not None:
        return state.score_weight
    return RULES.get(code, {}).get("weight", 0)


def all_rules_with_state(db: Session) -> list[dict]:
    """Получить список всех правил с их актуальным статусом для админки."""
    states = {r.rule_code: r for r in db.query(AntifraudRuleState).all()}
    result = []
    for code, meta in RULES.items():
        state = states.get(code)
        result.append({
            "code": code,
            "description": meta["description"],
            "phase": meta["phase"],
            "default_weight": meta["weight"],
            "weight": state.score_weight if state and state.score_weight is not None else meta["weight"],
            "enabled": bool(state.enabled) if state else True,
        })
    return result
