import json

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserSession, SessionEventType
from schemas import UserRegister, UserLogin, Token, UserOut, UserUpdate, MessageResponse
from auth import hash_password, verify_password, create_access_token, get_current_user
from services.http_utils import get_client_ip
from services.antifraud import check_registration

router = APIRouter(prefix="/auth", tags=["Авторизация"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(data: UserRegister, request: Request, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

    if data.phone and db.query(User).filter(User.phone == data.phone).first():
        raise HTTPException(status_code=400, detail="Телефон уже зарегистрирован")

    ip = get_client_ip(request)
    ua = data.user_agent or request.headers.get("User-Agent", "")[:500]

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        registered_ip=ip,
        device_fingerprint=data.device_fingerprint,
        registered_fp_hash=data.fp_hash,
        registered_ua=ua,
    )
    db.add(user)
    db.flush()

    # Velocity-проверка на регистрации
    fraud_result = check_registration(
        db=db,
        user=user,
        ip=ip,
        fp_hash=data.fp_hash,
        ua=ua,
        fp_components_json=json.dumps(data.fp_components, ensure_ascii=False) if data.fp_components else None,
        automation_flags=data.automation_flags,
        automation_score=data.automation_score or 0,
    )

    db.commit()
    db.refresh(user)

    # Если регистрация заблокирована — токен не выдаём
    if fraud_result["decision"] == "blocked" or user.is_blocked:
        raise HTTPException(
            status_code=403,
            detail="Регистрация отклонена системой антифрода",
        )

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.post("/login", response_model=Token)
def login(data: UserLogin, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    ip = get_client_ip(request)
    ua = data.user_agent or request.headers.get("User-Agent", "")[:500]

    # Не затираем `user.device_fingerprint` (это ломает историю мультиаккаунтинга).
    # Вместо этого пишем сессию в user_sessions, оставляя User.device_fingerprint
    # как «самый ранний известный».
    session_row = UserSession(
        user_id=user.id,
        event_type=SessionEventType.login,
        ip=ip,
        fp_hash=data.fp_hash,
        ua=ua,
        fp_components=json.dumps(data.fp_components, ensure_ascii=False) if data.fp_components else None,
        automation_flags=json.dumps(data.automation_flags, ensure_ascii=False) if data.automation_flags else None,
        automation_score=data.automation_score or 0,
    )
    db.add(session_row)

    # device_fingerprint выставляем только если он ещё не был установлен раньше
    if not user.device_fingerprint and data.device_fingerprint:
        user.device_fingerprint = data.device_fingerprint

    db.commit()

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.post("/login/form", response_model=Token)
def login_form(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 form-based login (для Swagger UI)."""
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.phone is not None:
        existing = db.query(User).filter(
            User.phone == data.phone, User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Телефон уже занят")
        current_user.phone = data.phone
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/logout", response_model=MessageResponse)
def logout():
    return MessageResponse(message="Вы успешно вышли из системы")
