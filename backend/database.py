from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},  # нужно для SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_columns():
    """
    Лёгкая авто-миграция для SQLite: добавляет недостающие колонки в существующие таблицы.

    SQLAlchemy `create_all` не дополняет существующие таблицы новыми колонками,
    поэтому при добавлении полей в модели мы делаем ALTER TABLE здесь.

    Это не полноценная миграционная система (alembic), но для прототипа достаточно
    и позволяет не сбрасывать БД при каждом изменении схемы антифрода.
    """
    inspector = inspect(engine)

    targets = {
        "users": {
            "registered_fp_hash":  "VARCHAR(64)",
            "registered_ua":       "VARCHAR(500)",
            "auto_flag_blocked":   "BOOLEAN DEFAULT 0",
        },
        "orders": {
            "order_fp_hash":            "VARCHAR(64)",
            "order_fp_components":      "TEXT",
            "order_ua":                 "VARCHAR(500)",
            "order_user_agent_short":   "VARCHAR(120)",
            "order_timezone":           "VARCHAR(64)",
            "order_lang":               "VARCHAR(32)",
            "order_screen":             "VARCHAR(32)",
            "order_automation_flags":   "TEXT",
            "order_time_on_page_ms":    "INTEGER",
            "order_form_fill_ms":       "INTEGER",
            "order_mouse_events":       "INTEGER",
            "order_key_events":         "INTEGER",
            "order_touch_events":       "INTEGER",
            "refund_note":              "VARCHAR(500)",
        },
    }

    with engine.connect() as conn:
        for table, columns in targets.items():
            if not inspector.has_table(table):
                continue
            existing = {col["name"] for col in inspector.get_columns(table)}
            for col_name, col_ddl in columns.items():
                if col_name in existing:
                    continue
                try:
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {col_name} {col_ddl}'))
                except Exception as e:
                    print(f"⚠️  ALTER TABLE {table} ADD COLUMN {col_name}: {e}")
        conn.commit()
