import os
import sys
import json
import requests

BASE = "https://client-stock-system.preview.emergentagent.com/api"
EMAIL = "aygunyusuf68@gmail.com"
PASSWORD = "admin123"

results = {"passed": [], "failed": []}

def ok(name):
    results["passed"].append(name)
    print(f"PASS: {name}")

def fail(name, detail):
    results["failed"].append({"area": name, "issue": detail})
    print(f"FAIL: {name} -> {detail}")

# 1. Auth: wrong password
r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": "wrong"})
if r.status_code == 401:
    ok("Login wrong password returns 401")
else:
    fail("Login wrong password", f"status {r.status_code}, body {r.text[:200]}")

# 2. Auth: correct
r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
if r.status_code != 200:
    fail("Login correct", f"status {r.status_code}, body {r.text[:200]}")
    print(json.dumps(results, indent=2))
    sys.exit(1)
data = r.json()
token = data.get("token")
if token and data.get("email") == EMAIL:
    ok("Login returns token+user")
else:
    fail("Login response shape", str(data))

H = {"Authorization": f"Bearer {token}"}

# 3. /auth/me
r = requests.get(f"{BASE}/auth/me", headers=H)
if r.status_code == 200 and r.json().get("email") == EMAIL:
    ok("GET /auth/me returns admin")
else:
    fail("/auth/me", f"{r.status_code} {r.text[:200]}")

# 4. Unauth check
r = requests.get(f"{BASE}/dashboard/summary")
if r.status_code == 401:
    ok("Dashboard requires auth")
else:
    fail("Dashboard no-auth", f"{r.status_code}")

r = requests.get(f"{BASE}/customers")
if r.status_code == 401:
    ok("Customers requires auth")
else:
    fail("Customers no-auth", f"{r.status_code}")

# 5. list customers
r = requests.get(f"{BASE}/customers", headers=H)
customers = r.json() if r.status_code == 200 else []
if len(customers) == 6:
    ok("6 customers seeded")
else:
    fail("Customer count", f"got {len(customers)}")
names = [c["name"] for c in customers]
expected = ["Müşteri A","Müşteri B","Müşteri C","Müşteri D","Müşteri E","Müşteri F"]
if all(e in names for e in expected):
    ok("Customer names correct")
else:
    fail("Customer names", str(names))

import uuid as _uuid
all_uuid = True
for c in customers:
    try:
        _uuid.UUID(c["id"])
    except Exception:
        all_uuid = False
if all_uuid:
    ok("Customer ids are valid uuids")
else:
    fail("Customer ids uuids", "invalid")

cA = customers[0]  # Müşteri A
cB = customers[1]

# 6. rename customer (rename A back to original after)
original_name = cA["name"]
r = requests.patch(f"{BASE}/customers/{cA['id']}", json={"name": "Müşteri A Test"}, headers=H)
if r.status_code == 200 and r.json().get("name") == "Müşteri A Test":
    ok("PATCH customer rename")
    requests.patch(f"{BASE}/customers/{cA['id']}", json={"name": original_name}, headers=H)
else:
    fail("PATCH customer", f"{r.status_code} {r.text[:200]}")

# 7. Create product for A with quantity - check initial movement
r = requests.post(f"{BASE}/customers/{cA['id']}/products",
                  json={"name":"Bileşen X","sku":"BX-1","unit":"adet","quantity":100,"low_stock_threshold":10}, headers=H)
if r.status_code == 200:
    pA = r.json()
    ok("Create product for A")
else:
    fail("Create product A", f"{r.status_code} {r.text[:200]}")
    print(json.dumps(results, indent=2))
    sys.exit(1)

# Check initial movement
r = requests.get(f"{BASE}/customers/{cA['id']}/movements", headers=H)
movs = r.json() if r.status_code == 200 else []
init_movs = [m for m in movs if m.get("product_id") == pA["id"] and m.get("kind") == "initial"]
if init_movs:
    ok("Initial movement logged")
else:
    fail("Initial movement", "not found")

# 8. Isolation: Create Bileşen X for B qty 50
r = requests.post(f"{BASE}/customers/{cB['id']}/products",
                  json={"name":"Bileşen X","sku":"BX-1","unit":"adet","quantity":50,"low_stock_threshold":5}, headers=H)
if r.status_code == 200:
    pB = r.json()
    ok("Create product for B")
else:
    fail("Create product B", f"{r.status_code} {r.text[:200]}")
    sys.exit(1)

# 9. Verify isolation
lA = requests.get(f"{BASE}/customers/{cA['id']}/products", headers=H).json()
lB = requests.get(f"{BASE}/customers/{cB['id']}/products", headers=H).json()
idsA = [p["id"] for p in lA]
idsB = [p["id"] for p in lB]
if pA["id"] in idsA and pA["id"] not in idsB and pB["id"] in idsB:
    ok("Product isolation between customers")
else:
    fail("Product isolation", f"A_ids={idsA} B_ids={idsB}")

# 10. Update product
r = requests.patch(f"{BASE}/customers/{cA['id']}/products/{pA['id']}",
                   json={"low_stock_threshold": 20}, headers=H)
if r.status_code == 200 and r.json().get("low_stock_threshold") == 20:
    ok("PATCH product update")
else:
    fail("PATCH product", f"{r.status_code} {r.text[:200]}")

# 11. Adjust +10
r = requests.post(f"{BASE}/customers/{cA['id']}/products/{pA['id']}/adjust",
                  json={"delta":10,"note":"test in"}, headers=H)
if r.status_code == 200 and r.json().get("quantity") == 110:
    ok("Adjust +10 (in)")
else:
    fail("Adjust +10", f"{r.status_code} {r.text[:200]}")

# 12. Adjust -5
r = requests.post(f"{BASE}/customers/{cA['id']}/products/{pA['id']}/adjust",
                  json={"delta":-5,"note":"test out"}, headers=H)
if r.status_code == 200 and r.json().get("quantity") == 105:
    ok("Adjust -5 (out)")
else:
    fail("Adjust -5", f"{r.status_code} {r.text[:200]}")

# check movements kinds
movs = requests.get(f"{BASE}/customers/{cA['id']}/movements", headers=H).json()
kinds = [m["kind"] for m in movs if m.get("product_id")==pA["id"]]
if "in" in kinds and "out" in kinds:
    ok("Movement kinds in/out logged")
else:
    fail("Movement kinds", str(kinds))

# 13. Adjust going below zero
r = requests.post(f"{BASE}/customers/{cA['id']}/products/{pA['id']}/adjust",
                  json={"delta":-999999}, headers=H)
if r.status_code == 400:
    ok("Adjust negative-below-zero returns 400")
else:
    fail("Adjust below zero", f"{r.status_code}")

# 14. Create package for A referencing pA
r = requests.post(f"{BASE}/customers/{cA['id']}/packages",
                  json={"code":"P3","name":"Test Paket","items":[{"product_id":pA["id"],"quantity":5}]}, headers=H)
if r.status_code == 200:
    pkg = r.json()
    ok("Create package for A")
else:
    fail("Create package", f"{r.status_code} {r.text[:200]}")
    sys.exit(1)

# 15. Update package items
r = requests.patch(f"{BASE}/customers/{cA['id']}/packages/{pkg['id']}",
                   json={"items":[{"product_id":pA["id"],"quantity":3}]}, headers=H)
if r.status_code == 200 and r.json()["items"][0]["quantity"] == 3:
    ok("PATCH package updates items")
else:
    fail("PATCH package", f"{r.status_code} {r.text[:200]}")

# 16. Preview order (qty 10 -> requires 30, avail 105)
r = requests.post(f"{BASE}/customers/{cA['id']}/orders/preview",
                  json={"package_id":pkg["id"],"quantity":10}, headers=H)
if r.status_code == 200:
    d = r.json()
    line = d["lines"][0]
    if (line["per_package"]==3 and line["required"]==30 and line["available"]==105
            and line["sufficient"] is True and d["insufficient"]==[]):
        ok("Order preview correct with sufficient stock")
    else:
        fail("Order preview data", str(d))
else:
    fail("Order preview", f"{r.status_code} {r.text[:200]}")

# 17. Create order with sufficient stock
qty_A_before = 105
qty_B_before = 50
r = requests.post(f"{BASE}/customers/{cA['id']}/orders",
                  json={"package_id":pkg["id"],"quantity":10}, headers=H)
if r.status_code == 200:
    ok("Create order (sufficient)")
else:
    fail("Create order", f"{r.status_code} {r.text[:200]}")

# verify A qty deducted
newA = requests.get(f"{BASE}/customers/{cA['id']}/products", headers=H).json()
qA_after = next(p["quantity"] for p in newA if p["id"]==pA["id"])
if qA_after == qty_A_before - 30:
    ok("Stock deducted correctly for A")
else:
    fail("Stock deduction A", f"expected {qty_A_before-30}, got {qA_after}")

# verify B untouched (STOCK ISOLATION)
newB = requests.get(f"{BASE}/customers/{cB['id']}/products", headers=H).json()
qB_after = next(p["quantity"] for p in newB if p["id"]==pB["id"])
if qB_after == qty_B_before:
    ok("STOCK ISOLATION: B unaffected by A order")
else:
    fail("Stock isolation B", f"expected {qty_B_before}, got {qB_after}")

# verify order movement
movs = requests.get(f"{BASE}/customers/{cA['id']}/movements", headers=H).json()
order_movs = [m for m in movs if m.get("kind")=="order" and m.get("product_id")==pA["id"]]
if order_movs and order_movs[0]["delta"] == -30:
    ok("Order movement logged with negative delta")
else:
    fail("Order movement", str(order_movs[:1]))

# 18. Insufficient stock: order 999 packages
r = requests.post(f"{BASE}/customers/{cA['id']}/orders",
                  json={"package_id":pkg["id"],"quantity":9999}, headers=H)
if r.status_code == 400:
    msg = r.json().get("detail","")
    if "Yetersiz" in msg or "yetersiz" in msg or "stok" in msg.lower():
        ok("Insufficient stock returns 400 with Turkish message")
    else:
        fail("Insufficient message", msg)
else:
    fail("Insufficient order", f"{r.status_code}")

# verify NO deduction happened
newA2 = requests.get(f"{BASE}/customers/{cA['id']}/products", headers=H).json()
qA2 = next(p["quantity"] for p in newA2 if p["id"]==pA["id"])
if qA2 == qA_after:
    ok("Insufficient stock did NOT deduct")
else:
    fail("Insufficient deduction check", f"changed from {qA_after} to {qA2}")

# 19. Dashboard
r = requests.get(f"{BASE}/dashboard/summary", headers=H)
if r.status_code == 200:
    d = r.json()
    checks = (d.get("total_customers")==6 and "total_products" in d and "total_orders" in d
              and "low_stock_count" in d and isinstance(d.get("low_stock"), list)
              and isinstance(d.get("recent_movements"), list)
              and isinstance(d.get("per_customer"), list) and len(d["per_customer"])==6)
    if checks:
        ok("Dashboard summary shape OK")
    else:
        fail("Dashboard shape", json.dumps(d)[:400])
    # recent sorted desc
    rm = d.get("recent_movements", [])
    if len(rm) < 2 or rm[0]["created_at"] >= rm[-1]["created_at"]:
        ok("Recent movements sorted desc")
    else:
        fail("Recent sort", "not desc")
else:
    fail("Dashboard", f"{r.status_code}")

# 20. CSV export products
r = requests.get(f"{BASE}/customers/{cA['id']}/export/products", headers=H)
if r.status_code == 200:
    text = r.text
    if text.startswith("\ufeff") and "name,sku,unit,quantity,low_stock_threshold" in text:
        ok("Export products CSV with BOM + headers")
    else:
        fail("Export products CSV", f"headers/BOM missing; first: {repr(text[:80])}")
else:
    fail("Export products", f"{r.status_code}")

# 21. CSV export movements
r = requests.get(f"{BASE}/customers/{cA['id']}/export/movements", headers=H)
if r.status_code == 200 and r.text.startswith("\ufeff"):
    ok("Export movements CSV")
else:
    fail("Export movements", f"{r.status_code}")

# 22. Delete package
r = requests.delete(f"{BASE}/customers/{cA['id']}/packages/{pkg['id']}", headers=H)
if r.status_code == 200:
    ok("DELETE package")
else:
    fail("Delete package", f"{r.status_code}")

# 23. Delete products (cleanup)
r = requests.delete(f"{BASE}/customers/{cA['id']}/products/{pA['id']}", headers=H)
if r.status_code == 200:
    ok("DELETE product A")
else:
    fail("Delete product A", f"{r.status_code}")
requests.delete(f"{BASE}/customers/{cB['id']}/products/{pB['id']}", headers=H)

print("\n===== SUMMARY =====")
print(f"Passed: {len(results['passed'])}")
print(f"Failed: {len(results['failed'])}")
for f_ in results["failed"]:
    print(f"  - {f_}")
