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
from urllib.parse import quote
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

class CustomerCreate(BaseModel):
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

class OrderPackageItem(BaseModel):
    package_id: str
    quantity: int

class OrderCreate(BaseModel):
    items: List[OrderPackageItem]
    note: Optional[str] = ""

class BulkImportRow(BaseModel):
    name: str
    sku: Optional[str] = ""
    unit: Optional[str] = "adet"
    quantity: float = 0
    low_stock_threshold: Optional[float] = None

class BulkImportBody(BaseModel):
    rows: List[BulkImportRow]
    mode: str = "add"  # "add" (increment existing) or "replace" (overwrite)

class BulkPackageRow(BaseModel):
    package_code: str
    package_name: Optional[str] = ""
    product_name: str
    quantity: float

class BulkPackageBody(BaseModel):
    rows: List[BulkPackageRow]
    mode: str = "replace"  # "replace" overwrites package items, "merge" appends

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
    docs = await db.customers.find({}, {"_id": 0}).sort("order", 1).to_list(500)
    return docs

@api.post("/customers")
async def create_customer(body: CustomerCreate, user=Depends(get_current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Müşteri adı gerekli")
    last = await db.customers.find_one({}, sort=[("order", -1)])
    next_order = (last["order"] + 1) if last and "order" in last else 1
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "order": next_order,
        "created_at": now_iso(),
    }
    await db.customers.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.patch("/customers/{customer_id}")
async def update_customer(customer_id: str, body: CustomerUpdate, user=Depends(get_current_user)):
    r = await db.customers.update_one({"id": customer_id}, {"$set": {"name": body.name.strip()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Müşteri bulunamadı")
    doc = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return doc

@api.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user=Depends(get_current_user)):
    c = await db.customers.find_one({"id": customer_id})
    if not c:
        raise HTTPException(404, "Müşteri bulunamadı")
    # Cascade: remove all data belonging to this customer
    r_prod = await db.products.delete_many({"customer_id": customer_id})
    r_pkg = await db.packages.delete_many({"customer_id": customer_id})
    r_ord = await db.orders.delete_many({"customer_id": customer_id})
    r_mov = await db.movements.delete_many({"customer_id": customer_id})
    await db.customers.delete_one({"id": customer_id})
    return {
        "ok": True,
        "deleted": {
            "products": r_prod.deleted_count,
            "packages": r_pkg.deleted_count,
            "orders": r_ord.deleted_count,
            "movements": r_mov.deleted_count,
        },
    }

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

@api.post("/customers/{customer_id}/products/bulk-import")
async def bulk_import_products(customer_id: str, body: BulkImportBody, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    if not body.rows:
        raise HTTPException(400, "En az bir satır gerekli")
    if body.mode not in ("add", "replace"):
        raise HTTPException(400, "Geçersiz mod")

    existing = await db.products.find({"customer_id": customer_id}, {"_id": 0}).to_list(5000)
    by_name = {p["name"].strip().lower(): p for p in existing}

    created = 0
    updated = 0
    ignored = 0
    details = []
    for r in body.rows:
        name = (r.name or "").strip()
        if not name:
            ignored += 1
            continue
        qty = float(r.quantity or 0)
        key = name.lower()
        if key in by_name:
            prod = by_name[key]
            if body.mode == "add":
                new_qty = float(prod["quantity"]) + qty
                delta = qty
                note = f"Toplu içe aktarma (+{qty})"
                kind = "in"
            else:  # replace
                new_qty = qty
                delta = qty - float(prod["quantity"])
                note = f"Toplu içe aktarma (yeni: {qty})"
                kind = "in" if delta >= 0 else "out"
            updates = {"quantity": new_qty}
            if r.sku: updates["sku"] = r.sku.strip()
            if r.unit: updates["unit"] = r.unit.strip()
            if r.low_stock_threshold is not None:
                updates["low_stock_threshold"] = float(r.low_stock_threshold)
            await db.products.update_one({"customer_id": customer_id, "id": prod["id"]}, {"$set": updates})
            if abs(delta) > 0:
                await log_movement(customer_id, prod["id"], prod["name"], delta, kind, note, None)
            updated += 1
            details.append({"name": name, "action": "updated", "delta": delta, "new_quantity": new_qty})
        else:
            new_id = str(uuid.uuid4())
            doc = {
                "id": new_id,
                "customer_id": customer_id,
                "name": name,
                "sku": (r.sku or "").strip(),
                "unit": (r.unit or "adet").strip(),
                "quantity": qty,
                "low_stock_threshold": float(r.low_stock_threshold or 0),
                "created_at": now_iso(),
            }
            await db.products.insert_one(doc)
            if qty > 0:
                await log_movement(customer_id, new_id, name, qty, "initial", "Toplu içe aktarma (yeni ürün)", None)
            created += 1
            details.append({"name": name, "action": "created", "delta": qty, "new_quantity": qty})

    return {"created": created, "updated": updated, "ignored": ignored, "details": details}

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

@api.post("/customers/{customer_id}/packages/bulk-import")
async def bulk_import_packages(customer_id: str, body: BulkPackageBody, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    if not body.rows:
        raise HTTPException(400, "En az bir satır gerekli")
    if body.mode not in ("replace", "merge"):
        raise HTTPException(400, "Geçersiz mod")

    # Load current products (name lowercase → doc) and packages (code → doc)
    products = await db.products.find({"customer_id": customer_id}, {"_id": 0}).to_list(5000)
    products_by_name = {p["name"].strip().lower(): p for p in products}
    existing_packages = await db.packages.find({"customer_id": customer_id}, {"_id": 0}).to_list(1000)
    packages_by_code = {p["code"].strip().lower(): p for p in existing_packages}

    # Group rows by package_code
    grouped = {}
    for r in body.rows:
        code = (r.package_code or "").strip()
        if not code:
            continue
        key = code.lower()
        if key not in grouped:
            grouped[key] = {"code": code, "name": (r.package_name or "").strip(), "items": []}
        elif r.package_name and not grouped[key]["name"]:
            grouped[key]["name"] = r.package_name.strip()
        grouped[key]["items"].append({
            "product_name": (r.product_name or "").strip(),
            "quantity": float(r.quantity or 0),
        })

    created = 0
    updated = 0
    skipped = []
    for key, g in grouped.items():
        resolved_items = []
        missing = []
        for it in g["items"]:
            pname = it["product_name"]
            qty = it["quantity"]
            if not pname or qty <= 0:
                continue
            prod = products_by_name.get(pname.lower())
            if not prod:
                missing.append(pname)
                continue
            resolved_items.append({"product_id": prod["id"], "quantity": qty})
        if missing:
            skipped.append({"code": g["code"], "reason": "missing_products", "missing_products": sorted(set(missing))})
            continue
        if not resolved_items:
            skipped.append({"code": g["code"], "reason": "no_valid_items", "missing_products": []})
            continue

        exists = packages_by_code.get(key)
        if exists:
            new_items = resolved_items if body.mode == "replace" else (exists.get("items", []) + resolved_items)
            updates = {"items": new_items}
            if g["name"]:
                updates["name"] = g["name"]
            await db.packages.update_one({"customer_id": customer_id, "id": exists["id"]}, {"$set": updates})
            updated += 1
        else:
            await db.packages.insert_one({
                "id": str(uuid.uuid4()),
                "customer_id": customer_id,
                "code": g["code"],
                "name": g["name"],
                "items": resolved_items,
                "created_at": now_iso(),
            })
            created += 1

    return {"created": created, "updated": updated, "skipped": skipped}

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

async def _resolve_order_items(customer_id: str, items: List[OrderPackageItem]):
    """Return (packages_meta, aggregated_lines) where aggregated_lines is a dict product_id -> {product, total_required, breakdown[{pkg_code, per_package, quantity}]}."""
    if not items:
        raise HTTPException(400, "En az bir paket seçmelisiniz")
    packages_meta = []
    aggregated = {}
    for it in items:
        if it.quantity <= 0:
            raise HTTPException(400, "Sipariş adedi 1'den küçük olamaz")
        pkg = await db.packages.find_one({"customer_id": customer_id, "id": it.package_id})
        if not pkg:
            raise HTTPException(404, f"Paket bulunamadı: {it.package_id}")
        if not pkg["items"]:
            raise HTTPException(400, f"Paket {pkg['code']} içeriği tanımlı değil")
        packages_meta.append({
            "package_id": pkg["id"], "code": pkg["code"],
            "name": pkg.get("name", ""), "quantity": int(it.quantity),
        })
        for pi in pkg["items"]:
            pid = pi["product_id"]
            req = float(pi["quantity"]) * float(it.quantity)
            if pid not in aggregated:
                aggregated[pid] = {"total_required": 0.0, "breakdown": []}
            aggregated[pid]["total_required"] += req
            aggregated[pid]["breakdown"].append({
                "package_code": pkg["code"],
                "per_package": pi["quantity"],
                "package_quantity": int(it.quantity),
                "subtotal": req,
            })
    return packages_meta, aggregated

@api.post("/customers/{customer_id}/orders/preview")
async def preview_order(customer_id: str, body: OrderCreate, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    packages_meta, aggregated = await _resolve_order_items(customer_id, body.items)
    lines = []
    insufficient = []
    for pid, agg in aggregated.items():
        prod = await db.products.find_one({"customer_id": customer_id, "id": pid}, {"_id": 0})
        if not prod:
            entry = {"product_id": pid, "product_name": "(silinmiş ürün)", "unit": "", "required": agg["total_required"], "available": 0, "sufficient": False, "breakdown": agg["breakdown"]}
            lines.append(entry); insufficient.append(entry); continue
        req = agg["total_required"]
        ok = float(prod["quantity"]) >= req
        entry = {
            "product_id": prod["id"],
            "product_name": prod["name"],
            "unit": prod.get("unit", "adet"),
            "required": req,
            "available": float(prod["quantity"]),
            "sufficient": ok,
            "breakdown": agg["breakdown"],
        }
        lines.append(entry)
        if not ok:
            insufficient.append(entry)
    lines.sort(key=lambda x: x["product_name"])
    return {"lines": lines, "insufficient": insufficient, "packages": packages_meta}

@api.post("/customers/{customer_id}/orders")
async def create_order(customer_id: str, body: OrderCreate, user=Depends(get_current_user)):
    await ensure_customer(customer_id)
    packages_meta, aggregated = await _resolve_order_items(customer_id, body.items)

    resolved = []
    for pid, agg in aggregated.items():
        prod = await db.products.find_one({"customer_id": customer_id, "id": pid})
        if not prod:
            raise HTTPException(400, "Pakette silinmiş ürün var, önce paket içeriğini düzenleyin")
        req = agg["total_required"]
        if float(prod["quantity"]) < req:
            raise HTTPException(400, f"Yetersiz stok: {prod['name']} (gerekli: {req}, mevcut: {prod['quantity']})")
        resolved.append((prod, req, agg["breakdown"]))

    order_id = str(uuid.uuid4())
    pkg_summary = ", ".join(f"{p['code']}x{p['quantity']}" for p in packages_meta)
    order_doc = {
        "id": order_id,
        "customer_id": customer_id,
        "packages": packages_meta,
        "summary": pkg_summary,
        "note": body.note or "",
        "status": "active",
        "lines": [{"product_id": p["id"], "product_name": p["name"], "unit": p.get("unit","adet"), "total": req, "breakdown": bd} for p, req, bd in resolved],
        "created_at": now_iso(),
    }
    await db.orders.insert_one(order_doc)

    for prod, req, _bd in resolved:
        new_qty = float(prod["quantity"]) - req
        await db.products.update_one({"id": prod["id"]}, {"$set": {"quantity": new_qty}})
        await log_movement(customer_id, prod["id"], prod["name"], -req, "order", f"Sipariş #{order_id[:8]} ({pkg_summary})", order_id)

    order_doc.pop("_id", None)
    return order_doc

@api.post("/customers/{customer_id}/orders/{order_id}/cancel")
async def cancel_order(customer_id: str, order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"customer_id": customer_id, "id": order_id})
    if not order:
        raise HTTPException(404, "Sipariş bulunamadı")
    if order.get("status") == "cancelled":
        raise HTTPException(400, "Sipariş zaten iptal edilmiş")

    summary = order.get("summary") or order.get("package_code", "")
    # Restore stock for each line
    for line in order.get("lines", []):
        prod = await db.products.find_one({"customer_id": customer_id, "id": line["product_id"]})
        # Old-format orders had 'per_package' instead of 'total' only; use 'total' when present else per_package*quantity
        restore = float(line.get("total") or (float(line.get("per_package", 0)) * float(order.get("quantity", 0))))
        if prod:
            await db.products.update_one({"id": prod["id"]}, {"$set": {"quantity": float(prod["quantity"]) + restore}})
            await log_movement(customer_id, prod["id"], prod["name"], restore, "cancel", f"İptal #{order_id[:8]} ({summary})", order_id)
        else:
            # Product deleted; still log the cancel entry with the stored name
            await log_movement(customer_id, line["product_id"], line["product_name"], restore, "cancel", f"İptal #{order_id[:8]} (ürün silinmiş)", order_id)

    await db.orders.update_one(
        {"customer_id": customer_id, "id": order_id},
        {"$set": {"status": "cancelled", "cancelled_at": now_iso()}}
    )
    doc = await db.orders.find_one({"customer_id": customer_id, "id": order_id}, {"_id": 0})
    return doc

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
TR_MAP = str.maketrans({"ş":"s","Ş":"S","ç":"c","Ç":"C","ğ":"g","Ğ":"G","ı":"i","İ":"I","ö":"o","Ö":"O","ü":"u","Ü":"U"})

def csv_response(rows: List[dict], headers: List[str], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    buf.write("\ufeff")  # BOM for Excel UTF-8 detection
    buf.write("sep=;\r\n")  # Explicit delimiter hint for Excel (all locales)
    w = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore", delimiter=";", lineterminator="\r\n")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    buf.seek(0)
    ascii_name = filename.translate(TR_MAP).encode("ascii", "ignore").decode() or "export.csv"
    disposition = f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={
        "Content-Disposition": disposition
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

@api.get("/customers/{customer_id}/export/packages")
async def export_packages(customer_id: str, user=Depends(get_current_user)):
    c = await ensure_customer(customer_id)
    products = await db.products.find({"customer_id": customer_id}, {"_id": 0}).to_list(5000)
    prod_name_by_id = {p["id"]: p["name"] for p in products}
    packages = await db.packages.find({"customer_id": customer_id}, {"_id": 0}).sort("code", 1).to_list(1000)
    rows = []
    for pk in packages:
        if not pk.get("items"):
            rows.append({"package_code": pk["code"], "package_name": pk.get("name", ""), "product_name": "", "quantity": ""})
            continue
        for it in pk["items"]:
            rows.append({
                "package_code": pk["code"],
                "package_name": pk.get("name", ""),
                "product_name": prod_name_by_id.get(it["product_id"], "(silinmiş ürün)"),
                "quantity": it["quantity"],
            })
    return csv_response(rows, ["package_code", "package_name", "product_name", "quantity"], f"paketler_{c['name']}.csv")

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
