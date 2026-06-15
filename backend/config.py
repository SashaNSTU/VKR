from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Эпл Пипл — Торговая платформа"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    YOOKASSA_SHOP_ID: str = "1352913"
    YOOKASSA_SECRET_KEY: str = "test_-Mg5WBXfCZEGBcBV0SNcDTe6AACK3HGj_AAgiNwMuqc"
    FRONTEND_URL: str = "http://localhost:5173"
    DATABASE_URL: str = "sqlite:///./applpeople_8002.db"

    SECRET_KEY: str = "SUPER_SECRET_KEY_CHANGE_IN_PRODUCTION_2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 часа

    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ]

    class Config:
        env_file = ".env"


settings = Settings()
