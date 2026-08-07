"""Backend regression + CSV export (Turkish Excel semicolon) tests."""
import os
import io
import csv
import re
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # Load from frontend/.env
    envpath = "/app/frontend/.env"
    if os.path.exists(envpath):
        with open(envpath) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "aygunyusuf68@gmail.com"
ADMIN_PASS = "admin123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def customer_id(auth):
    r = requests.get(f"{API}/customers", headers=auth, timeout=30)
    assert r.status_code == 200
    customers = r.json()
    assert len(customers) >= 1
    return customers[0]["id"]


# ---------- Auth basics ----------
class TestAuth:
    def test_login_wrong(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_login_ok(self, token):
        assert isinstance(token, str) and len(token) > 10

    def test_me(self, auth):
        r = requests.get(f"{API}/auth/me", headers=auth, timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_customers_unauth(self):
        r = requests.get(f"{API}/customers", timeout=30)
        assert r.status_code == 401

    def test_export_unauth(self, customer_id):
        r = requests.get(f"{API}/customers/{customer_id}/export/products", timeout=30)
        assert r.status_code == 401


# ---------- CSV format (Turkish Excel semicolon) ----------
class TestCsvFormat:
    def test_export_products_bom_and_sep(self, auth, customer_id):
        r = requests.get(f"{API}/customers/{customer_id}/export/products", headers=auth, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("text/csv")
        raw = r.content
        # BOM
        assert raw[:3] == b"\xef\xbb\xbf", f"BOM missing, first bytes = {raw[:10]!r}"
        after_bom = raw[3:]
        # sep hint line
        assert after_bom.startswith(b"sep=;\r\n"), f"sep=; hint missing. head={after_bom[:20]!r}"
        # header line
        rest = after_bom[len(b"sep=;\r\n"):]
        # first line after hint = header
        header_line = rest.split(b"\r\n", 1)[0]
        assert header_line == b"name;sku;unit;quantity;low_stock_threshold", header_line

    def test_export_products_crlf_and_field_count(self, auth, customer_id):
        r = requests.get(f"{API}/customers/{customer_id}/export/products", headers=auth, timeout=30)
        text = r.content.decode("utf-8-sig")  # strip BOM
        assert text.startswith("sep=;\r\n")
        lines = text.split("\r\n")
        # remove trailing empty
        lines = [l for l in lines if l != ""]
        # lines[0] = "sep=;", lines[1] = header
        assert lines[0] == "sep=;"
        assert lines[1] == "name;sku;unit;quantity;low_stock_threshold"
        # header count
        expected_seps = 4  # 5 headers - 1
        for row in lines[2:]:
            # count unquoted ; using csv parser
            reader = csv.reader(io.StringIO(row), delimiter=";")
            parsed = next(reader)
            assert len(parsed) == 5, f"Row didn't split into 5 fields: {row!r} -> {parsed}"

    def test_export_movements_bom_and_sep(self, auth, customer_id):
        r = requests.get(f"{API}/customers/{customer_id}/export/movements", headers=auth, timeout=30)
        assert r.status_code == 200, r.text
        raw = r.content
        assert raw[:3] == b"\xef\xbb\xbf"
        assert raw[3:].startswith(b"sep=;\r\n")
        rest = raw[3 + len(b"sep=;\r\n"):]
        header_line = rest.split(b"\r\n", 1)[0]
        assert header_line == b"created_at;product_name;delta;kind;note;order_id"

    def test_content_disposition_has_utf8_filename(self, auth, customer_id):
        r = requests.get(f"{API}/customers/{customer_id}/export/products", headers=auth, timeout=30)
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "filename=" in cd
        assert "filename*=UTF-8''" in cd, f"missing RFC5987 filename*: {cd}"

    def test_semicolon_in_field_is_quoted(self, auth, customer_id):
        # Create product with ';' in name
        name = "TEST;Semi;Product"
        payload = {"name": name, "sku": "TSEMI1", "unit": "adet", "quantity": 1, "low_stock_threshold": 0}
        cr = requests.post(f"{API}/customers/{customer_id}/products", headers=auth, json=payload, timeout=30)
        assert cr.status_code in (200, 201), cr.text
        pid = cr.json()["id"]
        try:
            r = requests.get(f"{API}/customers/{customer_id}/export/products", headers=auth, timeout=30)
            text = r.content.decode("utf-8-sig")
            # find our line
            found_line = None
            for line in text.split("\r\n"):
                if "TEST" in line and "TSEMI1" in line:
                    found_line = line
                    break
            assert found_line is not None, f"Product not in export. text={text[:500]}"
            # must be quoted
            assert '"TEST;Semi;Product"' in found_line, f"Semicolon field not quoted: {found_line!r}"
            # parse ensures 5 fields
            parsed = next(csv.reader(io.StringIO(found_line), delimiter=";"))
            assert len(parsed) == 5
            assert parsed[0] == name
        finally:
            requests.delete(f"{API}/customers/{customer_id}/products/{pid}", headers=auth, timeout=30)


# ---------- Bulk-import roundtrip ----------
class TestBulkImportRoundtrip:
    def test_bulk_add_appears_in_export(self, auth, customer_id):
        product_name = "RoundTrip Test"
        payload = {"mode": "add", "rows": [{"name": product_name, "quantity": 5}]}
        r = requests.post(f"{API}/customers/{customer_id}/products/bulk-import",
                          headers=auth, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        # export
        er = requests.get(f"{API}/customers/{customer_id}/export/products", headers=auth, timeout=30)
        assert er.status_code == 200
        text = er.content.decode("utf-8-sig")
        assert product_name in text, "bulk-imported product not found in export"
        # cleanup
        plist = requests.get(f"{API}/customers/{customer_id}/products", headers=auth, timeout=30).json()
        for p in plist:
            if p["name"] == product_name:
                requests.delete(f"{API}/customers/{customer_id}/products/{p['id']}", headers=auth, timeout=30)


# ---------- Regression: product/package/order/cancel/bulk replace ----------
class TestRegression:
    def test_product_crud(self, auth, customer_id):
        p = {"name": "TEST_Reg1", "sku": "REG1", "unit": "adet", "quantity": 10, "low_stock_threshold": 2}
        r = requests.post(f"{API}/customers/{customer_id}/products", headers=auth, json=p, timeout=30)
        assert r.status_code in (200, 201)
        pid = r.json()["id"]
        r2 = requests.patch(f"{API}/customers/{customer_id}/products/{pid}",
                            headers=auth, json={"quantity": 20}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["quantity"] == 20
        requests.delete(f"{API}/customers/{customer_id}/products/{pid}", headers=auth, timeout=30)

    def test_package_and_order_cancel_restores_stock(self, auth, customer_id):
        # create product
        pr = requests.post(f"{API}/customers/{customer_id}/products", headers=auth,
                           json={"name": "TEST_PkgProd", "sku": "PKGP1", "unit": "adet",
                                 "quantity": 50, "low_stock_threshold": 0}, timeout=30).json()
        pid = pr["id"]
        # create package
        pkg = requests.post(f"{API}/customers/{customer_id}/packages", headers=auth,
                            json={"code": "TEST_PKG1", "name": "Test Pkg",
                                  "items": [{"product_id": pid, "quantity": 2}]}, timeout=30)
        assert pkg.status_code in (200, 201), pkg.text
        pkgid = pkg.json()["id"]
        # create order for 3 packages -> deducts 6
        order = requests.post(f"{API}/customers/{customer_id}/orders", headers=auth,
                              json={"items": [{"package_id": pkgid, "quantity": 3}]}, timeout=30)
        assert order.status_code in (200, 201), order.text
        oid = order.json()["id"]
        # verify stock decreased
        after = requests.get(f"{API}/customers/{customer_id}/products/{pid}", headers=auth, timeout=30)
        if after.status_code == 200:
            assert after.json()["quantity"] == 44
        # cancel
        cancel_endpoints = [
            f"{API}/customers/{customer_id}/orders/{oid}/cancel",
            f"{API}/customers/{customer_id}/orders/{oid}",
        ]
        cancelled = False
        for ep in cancel_endpoints:
            for method in ("POST", "PATCH", "DELETE"):
                rc = requests.request(method, ep, headers=auth, timeout=30)
                if rc.status_code in (200, 204):
                    cancelled = True
                    break
            if cancelled:
                break
        assert cancelled, "could not cancel order via known endpoints"
        # stock restored
        restored = requests.get(f"{API}/customers/{customer_id}/products/{pid}", headers=auth, timeout=30)
        if restored.status_code == 200:
            assert restored.json()["quantity"] == 50, f"stock not restored: {restored.json()}"
        # movement 'cancel' exists
        movs = requests.get(f"{API}/customers/{customer_id}/movements", headers=auth, timeout=30)
        if movs.status_code == 200:
            kinds = [m.get("kind") for m in movs.json()]
            assert "cancel" in kinds, f"cancel movement missing. kinds={set(kinds)}"
        # cleanup
        requests.delete(f"{API}/customers/{customer_id}/packages/{pkgid}", headers=auth, timeout=30)
        requests.delete(f"{API}/customers/{customer_id}/products/{pid}", headers=auth, timeout=30)

    def test_bulk_replace_mode(self, auth, customer_id):
        # add first
        requests.post(f"{API}/customers/{customer_id}/products/bulk-import",
                      headers=auth, json={"mode": "add", "rows": [{"name": "TEST_ReplaceMe", "quantity": 10}]},
                      timeout=30)
        # replace to 3
        r = requests.post(f"{API}/customers/{customer_id}/products/bulk-import",
                          headers=auth, json={"mode": "replace", "rows": [{"name": "TEST_ReplaceMe", "quantity": 3}]},
                          timeout=30)
        assert r.status_code in (200, 201), r.text
        plist = requests.get(f"{API}/customers/{customer_id}/products", headers=auth, timeout=30).json()
        target = [p for p in plist if p["name"] == "TEST_ReplaceMe"]
        assert target, "replace product missing"
        assert target[0]["quantity"] == 3
        # cleanup
        requests.delete(f"{API}/customers/{customer_id}/products/{target[0]['id']}", headers=auth, timeout=30)

    def test_six_customers_seeded(self, auth):
        r = requests.get(f"{API}/customers", headers=auth, timeout=30)
        assert r.status_code == 200
        assert len(r.json()) >= 6
