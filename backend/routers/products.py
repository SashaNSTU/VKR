from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from database import get_db
from models import Product
from schemas import ProductOut, ProductCreate, ProductUpdate
from auth import get_current_admin

router = APIRouter(prefix="/products", tags=["Товары"])


@router.get("", response_model=List[ProductOut])
def get_products(
    brand: Optional[str] = Query(None, description="Фильтр по бренду"),
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    search: Optional[str] = Query(None, description="Поиск по названию"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Product).filter(Product.is_active == True)

    if brand:
        query = query.filter(Product.brand.ilike(f"%{brand}%"))
    if category:
        query = query.filter(Product.category.ilike(f"%{category}%"))
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)
    if search:
        query = query.filter(
            or_(
                Product.name.ilike(f"%{search}%"),
                Product.model.ilike(f"%{search}%"),
                Product.description.ilike(f"%{search}%"),
            )
        )

    return query.offset(skip).limit(limit).all()


@router.get("/brands", response_model=List[str])
def get_brands(db: Session = Depends(get_db)):
    brands = db.query(Product.brand).distinct().filter(Product.is_active == True).all()
    return [b[0] for b in brands]


@router.get("/categories", response_model=List[str])
def get_categories(
    brand: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Product.category).distinct().filter(Product.is_active == True)
    if brand:
        query = query.filter(Product.brand.ilike(f"%{brand}%"))
    cats = query.all()
    return [c[0] for c in cats]


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(
        Product.id == product_id, Product.is_active == True
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return product


# ─── Админ-эндпоинты ─────────────────────────────────────────────

@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    data: ProductCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_admin),
):
    product = Product(**data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    data: ProductUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    product.is_active = False   # soft delete
    db.commit()
    return {"message": "Товар удалён"}
