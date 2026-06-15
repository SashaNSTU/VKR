from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import CartItem, Product
from schemas import CartItemAdd, CartItemUpdate, CartOut, CartItemOut, MessageResponse
from auth import get_current_user
from models import User

router = APIRouter(prefix="/cart", tags=["Корзина"])


def calc_cart(items) -> CartOut:
    total = sum(item.product.price * item.quantity for item in items)
    return CartOut(
        items=[CartItemOut.model_validate(i) for i in items],
        total=round(total, 2),
        items_count=sum(i.quantity for i in items),
    )


@router.get("", response_model=CartOut)
def get_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = db.query(CartItem).filter(CartItem.user_id == current_user.id).all()
    return calc_cart(items)


@router.post("/add", response_model=CartOut)
def add_to_cart(
    data: CartItemAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = db.query(Product).filter(
        Product.id == data.product_id, Product.is_active == True
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    if product.stock < data.quantity:
        raise HTTPException(status_code=400, detail="Недостаточно товара на складе")

    existing = db.query(CartItem).filter(
        CartItem.user_id == current_user.id,
        CartItem.product_id == data.product_id,
    ).first()

    if existing:
        new_qty = existing.quantity + data.quantity
        if product.stock < new_qty:
            raise HTTPException(status_code=400, detail="Недостаточно товара на складе")
        existing.quantity = new_qty
    else:
        item = CartItem(
            user_id=current_user.id,
            product_id=data.product_id,
            quantity=data.quantity,
        )
        db.add(item)

    db.commit()
    items = db.query(CartItem).filter(CartItem.user_id == current_user.id).all()
    return calc_cart(items)


@router.patch("/{item_id}", response_model=CartOut)
def update_cart_item(
    item_id: int,
    data: CartItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(CartItem).filter(
        CartItem.id == item_id, CartItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    if item.product.stock < data.quantity:
        raise HTTPException(status_code=400, detail="Недостаточно товара на складе")

    item.quantity = data.quantity
    db.commit()
    items = db.query(CartItem).filter(CartItem.user_id == current_user.id).all()
    return calc_cart(items)


@router.delete("/{item_id}", response_model=CartOut)
def remove_from_cart(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(CartItem).filter(
        CartItem.id == item_id, CartItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")

    db.delete(item)
    db.commit()
    items = db.query(CartItem).filter(CartItem.user_id == current_user.id).all()
    return calc_cart(items)


@router.delete("", response_model=MessageResponse)
def clear_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(CartItem).filter(CartItem.user_id == current_user.id).delete()
    db.commit()
    return MessageResponse(message="Корзина очищена")
