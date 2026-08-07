# Stok & Paket Sipariş Sistemi — PRD

## Original Problem Statement
6 farklı müşteri, her müşterinin bağımsız stok envanteri. Her müşteri için ayrı Paket İçeriği (reçete) listesi. Sipariş girildiğinde paket içeriği × adet sadece o müşterinin stoklarından otomatik düşülecek. Yetersiz stok uyarısı ve tüm hareket kayıtları tutulacak.

## Architecture
- Backend: FastAPI + Motor (async MongoDB), JWT auth (bcrypt)
- Frontend: React 19 + React Router 7 + Tailwind + Shadcn UI + Sonner
- Font: Chivo (display) + IBM Plex Sans (body/data) — Swiss high-contrast design

## User Personas
- Yönetici (admin): Tek kullanıcı, tüm müşteri stok/paket/siparişlerini yönetir.

## Core Requirements (implemented ✅)
- 6 seed müşteri (isim düzenlenebilir)
- Müşteri-başına bağımsız ürün envanteri (name, sku, unit, quantity, low_stock_threshold)
- Müşteri-başına paket reçeteleri (code, name, items[{product_id, quantity}])
- Sipariş girişi (paket + adet) → önizleme → onay → stoktan otomatik düşüş + hareket logu
- Yetersiz stok kontrolü (400 + Türkçe mesaj)
- Manuel stok +/− düzeltme
- Dashboard: KPI'lar, düşük stok listesi, son 15 hareket, müşteri özet tablosu
- CSV export (stok ve hareket, Türkçe karakter destekli)
- JWT auth (Bearer + httpOnly cookie), admin seed (aygunyusuf68@gmail.com / admin123)

## Backlog (P1)
- Sipariş iptali / iade (stoku geri yükle)
- Barkod okuyucu ile hızlı ürün girişi
- Aylık/haftalık tüketim raporu grafikleri
- Çoklu kullanıcı ve rol yönetimi
- Excel (xlsx) export
