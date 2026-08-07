from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import csv
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------------- DB ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Stok & Paket Sipariş Sistemi")
api = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

DEFAULT_CUSTOMERS = [
    "Müşteri A", "Müşteri B", "Müşteri C",
    "Müşteri D", "Müşteri E", "Müşteri F",
]

# ---------------- Utils ----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Yetkilendirme gerekli")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Oturum süresi doldu")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Geçersiz token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "Kullanıcı bulunamadı")
    return user

# ---------------- Models ----------------
class LoginBody(BaseModel):
    email: EmailStr
    password: str

class CustomerUpdate(BaseModel):
    name: str

class ProductCreate(BaseModel):
    name: str
    sku: Optional[str] = ""
    unit: Optional[str] = "adet"
    quantity: float = 0
    low_stock_threshold: float = 0

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None
    low_stock_threshold: Optional[float] = None

class StockAdjust(BaseModel):
    delta: float  # positive to add, negative to remove
    note: Optional[str] = ""

class PackageItem(BaseModel):
    product_id: str
    quantity: float

class PackageCreate(BaseModel):
    code: str  # örn: "P3" veya "3"
    name: Optional[str] = ""
    items: List[PackageItem] = []

class PackageUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    items: Optional[List[PackageItem]] = None

class OrderCreate(BaseModel):
    package_id: str
    quantity: int
    note: Optional[str] = ""

# ---------------- Startup ----------------
@app.on_event("startup")
async def startup():
    # indexes
    await db.users.create_index("email", unique=True)
    await db.customers.create_index("id", unique=True)
    await db.products.create_index([("customer_id", 1), ("id", 1)], unique=True)
    await db.packages.create_index([("customer_id", 1), ("id", 1)], unique=True)
    await db.packages.create_index([("customer_id", 1), ("code", 1)])
    await db.orders.create_index("customer_id")
    await db.movements.create_index([("customer_id", 1), ("created_at", -1)])

    # seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_password),
            "created_at": now_iso(),
        })
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    # seed 6 customers if not exists
    count = await db.customers.count_documents({})
    if count == 0:
        for i, name in enumerate(DEFAULT_CUSTOMERS):
            await db.customers.insert_one({
                "id": str(uuid.uuid4()),
                "name": name,
                "order": i + 1,
                "created_at": now_iso(),
            })

# ---------------- Auth ----------------
@api.post("/auth/login")
async def login(body: LoginBody, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(401, "E-posta veya şifre hatalı")
    token = create_access_token(user["id"], email)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=7*24*3600, path="/")
    return {"id": user["id"], "email": email, "name": user.get("name", ""), "token": token}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

# ---------------- Customers ----------------
@api.get("/customers")
async def list_customers(user=Depends(get_current_user)):
    docs = await db.customers.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    return docs

@api.patch("/customers/{customer_id}")
async def update_customer(customer_id: str, body: CustomerUpdate, user=Depends(get_current_user)):
    r = await db.customers.update_one({"id": customer_id}, {"$set": {"name": body.name}})
    if r.matched_count == 0:
        raise HTTPException(404, "Müşteri bulunamadı")
    doc = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return doc

async def ensure_customer(customer_id: str):
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Müşteri bulunamadı")
    return c

# ---------------- Products (per customer) ----------------
@api.get("/customers/{customer_id}/products")
async def list_products(customer_id: str, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    docs = await db.products.find({"customer_id": customer_id}, {"_id": 0}).sort("name", 1).to_list(1000)
    return docs

@api.post("/customers/{customer_id}/products")
async def create_product(customer_id: str, body: ProductCreate, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    doc = {
        "id": str(uuid.uuid4()),
        "customer_id": customer_id,
        "name": body.name.strip(),
        "sku": (body.sku or "").strip(),
        "unit": (body.unit or "adet").strip(),
        "quantity": float(body.quantity),
        "low_stock_threshold": float(body.low_stock_threshold),
        "created_at": now_iso(),
    }
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    # log initial stock as movement if quantity > 0
    if doc["quantity"] > 0:
        await log_movement(customer_id, doc["id"], doc["name"], doc["quantity"], "initial", "Başlangıç stoğu", None)
    return doc

@api.patch("/customers/{customer_id}/products/{product_id}")
async def update_product(customer_id: str, product_id: str, body: ProductUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(400, "Güncellenecek alan yok")
    r = await db.products.update_one({"customer_id": customer_id, "id": product_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Ürün bulunamadı")
    doc = await db.products.find_one({"customer_id": customer_id, "id": product_id}, {"_id": 0})
    return doc

@api.delete("/customers/{customer_id}/products/{product_id}")
async def delete_product(customer_id: str, product_id: str, user=Depends(get_current_user)):
    r = await db.products.delete_one({"customer_id": customer_id, "id": product_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Ürün bulunamadı")
    return {"ok": True}

@api.post("/customers/{customer_id}/products/{product_id}/adjust")
async def adjust_product(customer_id: str, product_id: str, body: StockAdjust, user=Depends(get_current_user)):
    prod = await db.products.find_one({"customer_id": customer_id, "id": product_id})
    if not prod:
        raise HTTPException(404, "Ürün bulunamadı")
    new_qty = float(prod["quantity"]) + float(body.delta)
    if new_qty < 0:
        raise HTTPException(400, "Stok negatif olamaz")
    await db.products.update_one({"customer_id": customer_id, "id": product_id}, {"$set": {"quantity": new_qty}})
    kind = "in" if body.delta > 0 else "out"
    await log_movement(customer_id, product_id, prod["name"], body.delta, kind, body.note or "Manuel düzeltme", None)
    return {"ok": True, "quantity": new_qty}

# ---------------- Packages ----------------
@api.get("/customers/{customer_id}/packages")
async def list_packages(customer_id: str, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    docs = await db.packages.find({"customer_id": customer_id}, {"_id": 0}).sort("code", 1).to_list(1000)
    return docs

@api.post("/customers/{customer_id}/packages")
async def create_package(customer_id: str, body: PackageCreate, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    doc = {
        "id": str(uuid.uuid4()),
        "customer_id": customer_id,
        "code": body.code.strip(),
        "name": (body.name or "").strip(),
        "items": [i.model_dump() for i in body.items],
        "created_at": now_iso(),
    }
    await db.packages.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.patch("/customers/{customer_id}/packages/{package_id}")
async def update_package(customer_id: str, package_id: str, body: PackageUpdate, user=Depends(get_current_user)):
    updates = {}
    if body.code is not None: updates["code"] = body.code.strip()
    if body.name is not None: updates["name"] = body.name.strip()
    if body.items is not None: updates["items"] = [i.model_dump() for i in body.items]
    if not updates:
        raise HTTPException(400, "Güncellenecek alan yok")
    r = await db.packages.update_one({"customer_id": customer_id, "id": package_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Paket bulunamadı")
    doc = await db.packages.find_one({"customer_id": customer_id, "id": package_id}, {"_id": 0})
    return doc

@api.delete("/customers/{customer_id}/packages/{package_id}")
async def delete_package(customer_id: str, package_id: str, user=Depends(get_current_user)):
    r = await db.packages.delete_one({"customer_id": customer_id, "id": package_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Paket bulunamadı")
    return {"ok": True}

# ---------------- Movements ----------------
async def log_movement(customer_id: str, product_id: str, product_name: str, delta: float, kind: str, note: str, order_id: Optional[str]):
    await db.movements.insert_one({
        "id": str(uuid.uuid4()),
        "customer_id": customer_id,
        "product_id": product_id,
        "product_name": product_name,
        "delta": float(delta),
        "kind": kind,  # "in", "out", "order", "initial"
        "note": note,
        "order_id": order_id,
        "created_at": now_iso(),
    })

@api.get("/customers/{customer_id}/movements")
async def list_movements(customer_id: str, limit: int = 500, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    docs = await db.movements.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs

# ---------------- Orders ----------------
@api.get("/customers/{customer_id}/orders")
async def list_orders(customer_id: str, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    docs = await db.orders.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

@api.post("/customers/{customer_id}/orders/preview")
async def preview_order(customer_id: str, body: OrderCreate, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    pkg = await db.packages.find_one({"customer_id": customer_id, "id": body.package_id})
    if not pkg:
        raise HTTPException(404, "Paket bulunamadı")
    if body.quantity <= 0:
        raise HTTPException(400, "Sipariş adedi 1'den küçük olamaz")
    result = []
    insufficient = []
    for item in pkg["items"]:
        prod = await db.products.find_one({"customer_id": customer_id, "id": item["product_id"]}, {"_id": 0})
        if not prod:
            insufficient.append({"product_name": "(silinmiş ürün)", "required": item["quantity"] * body.quantity, "available": 0})
            continue
        req = float(item["quantity"]) * float(body.quantity)
        ok = float(prod["quantity"]) >= req
        entry = {
            "product_id": prod["id"],
            "product_name": prod["name"],
            "unit": prod.get("unit", "adet"),
            "per_package": item["quantity"],
            "required": req,
            "available": float(prod["quantity"]),
            "sufficient": ok,
        }
        result.append(entry)
        if not ok:
            insufficient.append(entry)
    return {"lines": result, "insufficient": insufficient, "package": {"code": pkg["code"], "name": pkg.get("name", "")}}

@api.post("/customers/{customer_id}/orders")
async def create_order(customer_id: str, body: OrderCreate, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    pkg = await db.packages.find_one({"customer_id": customer_id, "id": body.package_id})
    if not pkg:
        raise HTTPException(404, "Paket bulunamadı")
    if body.quantity <= 0:
        raise HTTPException(400, "Sipariş adedi 1'den küçük olamaz")
    if not pkg["items"]:
        raise HTTPException(400, "Paketin içeriği tanımlı değil")

    # Verify stock for all lines first
    lines = []
    for item in pkg["items"]:
        prod = await db.products.find_one({"customer_id": customer_id, "id": item["product_id"]})
        if not prod:
            raise HTTPException(400, f"Pakette silinmiş ürün var, önce paket içeriğini düzenleyin")
        req = float(item["quantity"]) * float(body.quantity)
        if float(prod["quantity"]) < req:
            raise HTTPException(400, f"Yetersiz stok: {prod['name']} (gerekli: {req}, mevcut: {prod['quantity']})")
        lines.append((prod, req, item["quantity"]))

    order_id = str(uuid.uuid4())
    order_doc = {
        "id": order_id,
        "customer_id": customer_id,
        "package_id": pkg["id"],
        "package_code": pkg["code"],
        "package_name": pkg.get("name", ""),
        "quantity": int(body.quantity),
        "note": body.note or "",
        "lines": [{"product_id": p["id"], "product_name": p["name"], "per_package": per, "total": req} for p, req, per in lines],
        "created_at": now_iso(),
    }
    await db.orders.insert_one(order_doc)

    # Deduct and log
    for prod, req, _per in lines:
        new_qty = float(prod["quantity"]) - req
        await db.products.update_one({"id": prod["id"]}, {"$set": {"quantity": new_qty}})
        await log_movement(customer_id, prod["id"], prod["name"], -req, "order", f"Sipariş #{order_id[:8]} ({pkg['code']} x {body.quantity})", order_id)

    order_doc.pop("_id", None)
    return order_doc

# ---------------- Dashboard ----------------
@api.get("/dashboard/summary")
async def dashboard(user=Depends(get_current_user)):
    customers = await db.customers.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    total_orders = await db.orders.count_documents({})
    total_products = await db.products.count_documents({})

    low_stock = []
    async for p in db.products.find({}, {"_id": 0}):
        thr = float(p.get("low_stock_threshold", 0) or 0)
        if thr > 0 and float(p.get("quantity", 0)) <= thr:
            low_stock.append(p)

    recent = await db.movements.find({}, {"_id": 0}).sort("created_at", -1).to_list(15)

    per_customer = []
    for c in customers:
        cid = c["id"]
        o = await db.orders.count_documents({"customer_id": cid})
        p = await db.products.count_documents({"customer_id": cid})
        pk = await db.packages.count_documents({"customer_id": cid})
        per_customer.append({"customer": c, "orders": o, "products": p, "packages": pk})

    return {
        "total_orders": total_orders,
        "total_products": total_products,
        "total_customers": len(customers),
        "low_stock_count": len(low_stock),
        "low_stock": low_stock[:20],
        "recent_movements": recent,
        "per_customer": per_customer,
    }

# ---------------- CSV Export ----------------
def csv_response(rows: List[dict], headers: List[str], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    buf.write("\ufeff")  # BOM for Excel Turkish support
    w = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{filename}"'
    })

@api.get("/customers/{customer_id}/export/products")
async def export_products(customer_id: str, user=Depends(get_current_user)):
    c = await ensure_customer(customer_id)
    products = await db.products.find({"customer_id": customer_id}, {"_id": 0}).sort("name", 1).to_list(2000)
    return csv_response(products, ["name", "sku", "unit", "quantity", "low_stock_threshold"], f"stok_{c['name']}.csv")

@api.get("/customers/{customer_id}/export/movements")
async def export_movements(customer_id: str, user=Depends(get_current_user)):
    c = await ensure_customer(customer_id)
    movs = await db.movements.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return csv_response(movs, ["created_at", "product_name", "delta", "kind", "note", "order_id"], f"hareketler_{c['name']}.csv")

# ---------------- Mount ----------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown():
    client.close()
