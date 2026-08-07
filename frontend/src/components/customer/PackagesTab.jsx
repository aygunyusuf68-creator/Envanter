import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Save, X, Package, Download, Upload, FileSpreadsheet, TriangleAlert } from "lucide-react";
import api, { API } from "@/lib/api";
import { parseCSV } from "@/lib/csv";

const EMPTY_PKG = { code: "", name: "", items: [] };

const PKG_ALIASES = {
    package_code: ["package_code", "paket_kodu", "paket kodu", "kod", "paket"],
    package_name: ["package_name", "paket_adı", "paket adı", "paket adi", "ad", "isim"],
    product_name: ["product_name", "ürün", "urun", "ürün adı", "urun adi", "malzeme"],
    quantity: ["quantity", "miktar", "adet"],
};

export default function PackagesTab({ customerId }) {
    const [packages, setPackages] = useState([]);
    const [products, setProducts] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_PKG);

    // Bulk import
    const [importOpen, setImportOpen] = useState(false);
    const [importRows, setImportRows] = useState([]);
    const [importFileName, setImportFileName] = useState("");
    const [importMode, setImportMode] = useState("replace");
    const [importing, setImporting] = useState(false);

    const load = async () => {
        const [pk, pr] = await Promise.all([
            api.get(`/customers/${customerId}/packages`),
            api.get(`/customers/${customerId}/products`),
        ]);
        setPackages(pk.data);
        setProducts(pr.data);
    };
    useEffect(() => { load(); }, [customerId]);

    const productName = (id) => products.find((p) => p.id === id)?.name || "—";
    const productUnit = (id) => products.find((p) => p.id === id)?.unit || "";
    const productByLowerName = useMemo(() => {
        const m = new Map();
        products.forEach((p) => m.set(p.name.trim().toLowerCase(), p));
        return m;
    }, [products]);

    // ---------- Manual form ----------
    const addLine = () => setForm({...form, items: [...form.items, { product_id: "", quantity: 1 }]});
    const updateLine = (i, patch) => {
        const items = [...form.items]; items[i] = {...items[i], ...patch}; setForm({...form, items});
    };
    const removeLine = (i) => setForm({...form, items: form.items.filter((_, idx) => idx !== i)});

    const submit = async (e) => {
        e.preventDefault();
        if (!form.code.trim()) return toast.error("Paket kodu gerekli");
        const cleanItems = form.items
            .filter((it) => it.product_id && Number(it.quantity) > 0)
            .map((it) => ({ product_id: it.product_id, quantity: Number(it.quantity) }));
        const payload = { code: form.code.trim(), name: form.name.trim(), items: cleanItems };
        try {
            if (editingId) {
                await api.patch(`/customers/${customerId}/packages/${editingId}`, payload);
                toast.success("Paket güncellendi");
            } else {
                await api.post(`/customers/${customerId}/packages`, payload);
                toast.success("Paket oluşturuldu");
            }
            setShowForm(false); setEditingId(null); setForm(EMPTY_PKG); load();
        } catch (err) { toast.error(err?.response?.data?.detail || "Hata"); }
    };

    const del = async (pk) => {
        if (!window.confirm(`Paket "${pk.code}" silinsin mi?`)) return;
        await api.delete(`/customers/${customerId}/packages/${pk.id}`);
        toast.success("Paket silindi");
        load();
    };

    const startEdit = (pk) => {
        setEditingId(pk.id);
        setForm({ code: pk.code, name: pk.name || "", items: pk.items.map((i) => ({...i})) });
        setShowForm(true);
    };

    // ---------- Import ----------
    const canonicalKey = (h) => {
        const norm = h.toLowerCase().trim();
        for (const [k, aliases] of Object.entries(PKG_ALIASES)) {
            if (aliases.some((a) => a === norm)) return k;
        }
        return null;
    };

    const handleFile = async (file) => {
        if (!file) return;
        try {
            const text = await file.text();
            const { headers, rows } = parseCSV(text);
            if (!rows.length) { toast.error("CSV boş görünüyor"); return; }
            const keyMap = {};
            headers.forEach((h) => {
                const k = canonicalKey(h);
                if (k) keyMap[h] = k;
            });
            const kmVals = Object.values(keyMap);
            if (!kmVals.includes("package_code") || !kmVals.includes("product_name") || !kmVals.includes("quantity")) {
                toast.error("Zorunlu sütunlar: package_code, product_name, quantity");
                return;
            }
            const normalized = rows
                .map((r) => {
                    const o = { package_code: "", package_name: "", product_name: "", quantity: 0 };
                    for (const [origKey, canonKey] of Object.entries(keyMap)) {
                        const v = r[origKey];
                        if (canonKey === "quantity") {
                            const n = Number(String(v).replace(",", "."));
                            o.quantity = isNaN(n) ? 0 : n;
                        } else {
                            o[canonKey] = v;
                        }
                    }
                    return o;
                })
                .filter((r) => r.package_code && r.product_name && r.quantity > 0);
            if (!normalized.length) { toast.error("Geçerli satır bulunamadı"); return; }
            setImportRows(normalized);
            setImportFileName(file.name);
        } catch (e) {
            toast.error("CSV okunamadı: " + e.message);
        }
    };

    // Group preview and detect missing products
    const importPreview = useMemo(() => {
        const groups = new Map();
        importRows.forEach((r) => {
            const key = r.package_code.trim().toLowerCase();
            if (!groups.has(key)) groups.set(key, { code: r.package_code, name: r.package_name || "", items: [], missing: [] });
            const g = groups.get(key);
            if (r.package_name && !g.name) g.name = r.package_name;
            const prod = productByLowerName.get(r.product_name.trim().toLowerCase());
            g.items.push({ product_name: r.product_name, quantity: r.quantity, found: !!prod, unit: prod?.unit });
            if (!prod && !g.missing.includes(r.product_name)) g.missing.push(r.product_name);
        });
        return Array.from(groups.values());
    }, [importRows, productByLowerName]);

    const anyMissing = importPreview.some((g) => g.missing.length > 0);

    const submitImport = async () => {
        if (!importRows.length) return;
        setImporting(true);
        try {
            const { data } = await api.post(`/customers/${customerId}/packages/bulk-import`, {
                rows: importRows, mode: importMode,
            });
            const skippedCount = (data.skipped || []).length;
            let msg = `${data.created} yeni paket, ${data.updated} güncellendi`;
            if (skippedCount) msg += `, ${skippedCount} atlandı`;
            toast.success("İçe aktarma tamam: " + msg);
            if (data.skipped?.length) {
                data.skipped.forEach((s) => {
                    const detail = s.missing_products?.length ? ` (eksik ürün: ${s.missing_products.join(", ")})` : "";
                    toast.warning(`${s.code} paketi atlandı${detail}`);
                });
            }
            setImportOpen(false); setImportRows([]); setImportFileName("");
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "İçe aktarma başarısız");
        } finally { setImporting(false); }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="label-caps text-neutral-500">Paket Reçeteleri · {packages.length} paket</div>
                <div className="flex gap-2">
                    <a
                        href={`${API}/customers/${customerId}/export/packages`}
                        data-testid="export-packages-csv"
                        className="h-9 px-3 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm flex items-center gap-1">
                        <Download size={12}/> CSV İndir
                    </a>
                    <button
                        data-testid="import-packages-csv"
                        onClick={() => { setImportOpen(true); setImportRows([]); setImportFileName(""); setImportMode("replace"); }}
                        className="h-9 px-3 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm flex items-center gap-1">
                        <Upload size={12}/> CSV Yükle
                    </button>
                    <button
                        data-testid="add-package-button"
                        onClick={() => { setShowForm(true); setEditingId(null); setForm({...EMPTY_PKG, items: []}); }}
                        className="h-9 px-3 bg-[#0A0A0A] hover:bg-[#0052FF] text-white text-xs rounded-sm flex items-center gap-1 transition-colors">
                        <Plus size={14}/> Paket Ekle
                    </button>
                </div>
            </div>

            {showForm && (
                <form onSubmit={submit} className="bg-white border border-neutral-200 p-4 mb-4" data-testid="package-form">
                    <div className="grid grid-cols-12 gap-3 mb-4">
                        <div className="col-span-4 md:col-span-3">
                            <div className="label-caps text-neutral-500 mb-1">Kod</div>
                            <input data-testid="package-code-input" value={form.code} onChange={(e) => setForm({...form, code: e.target.value})} placeholder="Örn: 3 veya P3" className="w-full h-9 px-2 border border-neutral-300 rounded-sm text-sm"/>
                        </div>
                        <div className="col-span-8 md:col-span-9">
                            <div className="label-caps text-neutral-500 mb-1">Açıklama (opsiyonel)</div>
                            <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full h-9 px-2 border border-neutral-300 rounded-sm text-sm"/>
                        </div>
                    </div>

                    <div className="label-caps text-neutral-500 mb-2">İçerik</div>
                    <div className="space-y-2 mb-3">
                        {form.items.length === 0 && (
                            <div className="text-sm text-neutral-500 py-3">Henüz ürün eklenmedi. Alta "Ürün Ekle"ye basın.</div>
                        )}
                        {form.items.map((it, i) => (
                            <div key={i} className="grid grid-cols-12 gap-2 items-center">
                                <select
                                    data-testid={`package-line-product-${i}`}
                                    value={it.product_id}
                                    onChange={(e) => updateLine(i, { product_id: e.target.value })}
                                    className="col-span-8 h-9 px-2 border border-neutral-300 rounded-sm text-sm bg-white">
                                    <option value="">Ürün seçin…</option>
                                    {products.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                                    ))}
                                </select>
                                <input
                                    data-testid={`package-line-qty-${i}`}
                                    type="number" step="any" value={it.quantity}
                                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                                    placeholder="Adet/paket"
                                    className="col-span-3 h-9 px-2 border border-neutral-300 rounded-sm text-sm tabular-nums"/>
                                <button type="button" onClick={() => removeLine(i)} className="col-span-1 h-9 border border-neutral-300 hover:bg-[#E50000] hover:text-white rounded-sm grid place-items-center transition-colors">
                                    <Trash2 size={12}/>
                                </button>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addLine} data-testid="package-add-line" className="h-9 px-3 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm flex items-center gap-1">
                        <Plus size={12}/> Ürün Ekle
                    </button>

                    <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-neutral-200">
                        <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="h-9 px-3 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm flex items-center gap-1">
                            <X size={12}/> İptal
                        </button>
                        <button type="submit" data-testid="package-submit" className="h-9 px-4 bg-[#0A0A0A] hover:bg-[#0052FF] text-white text-xs rounded-sm flex items-center gap-1 transition-colors">
                            <Save size={12}/> {editingId ? "Güncelle" : "Kaydet"}
                        </button>
                    </div>
                </form>
            )}

            <div className="space-y-3">
                {packages.length === 0 && (
                    <div className="bg-white border border-neutral-200 p-10 text-center text-neutral-500 text-sm">Henüz paket tanımı yok.</div>
                )}
                {packages.map((pk) => (
                    <div key={pk.id} className="bg-white border border-neutral-200" data-testid={`package-card-${pk.id}`}>
                        <header className="h-12 px-4 border-b border-neutral-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-[#0A0A0A] text-white grid place-items-center font-mono text-xs rounded-sm">{pk.code}</div>
                                <div>
                                    <div className="font-medium text-sm">Paket {pk.code}</div>
                                    <div className="text-xs text-neutral-500">{pk.name || `${pk.items.length} ürün`}</div>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button data-testid={`package-edit-${pk.id}`} onClick={() => startEdit(pk)} className="h-8 px-3 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm flex items-center gap-1">
                                    <Pencil size={12}/> Düzenle
                                </button>
                                <button data-testid={`package-delete-${pk.id}`} onClick={() => del(pk)} className="h-8 w-8 border border-neutral-300 hover:bg-[#E50000] hover:text-white grid place-items-center rounded-sm transition-colors">
                                    <Trash2 size={12}/>
                                </button>
                            </div>
                        </header>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="label-caps text-neutral-500 text-left border-b border-neutral-100">
                                    <th className="px-4 py-2">Ürün</th>
                                    <th className="px-4 py-2 text-right w-40">Adet / Paket</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pk.items.length === 0 && (
                                    <tr><td colSpan={2} className="px-4 py-6 text-center text-neutral-500">İçerik tanımlı değil</td></tr>
                                )}
                                {pk.items.map((it, i) => (
                                    <tr key={i} className="border-b border-neutral-100">
                                        <td className="px-4 py-2">{productName(it.product_id)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{it.quantity} <span className="text-neutral-500 text-xs">{productUnit(it.product_id)}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </div>

            {importOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" onClick={() => setImportOpen(false)}>
                    <div className="bg-white border border-neutral-200 max-w-4xl w-full max-h-[85vh] flex flex-col" onClick={(e)=>e.stopPropagation()} data-testid="package-import-dialog">
                        <header className="h-12 px-4 border-b border-neutral-200 flex items-center gap-2">
                            <FileSpreadsheet size={16}/>
                            <div className="font-display font-bold">Toplu Paket Girişi (CSV)</div>
                            <button onClick={() => setImportOpen(false)} className="ml-auto h-8 w-8 grid place-items-center hover:bg-neutral-100 rounded-sm"><X size={14}/></button>
                        </header>

                        <div className="p-4 border-b border-neutral-100 bg-neutral-50 text-xs text-neutral-600">
                            <div className="mb-1"><strong>Sütunlar:</strong> <code className="font-mono">package_code, package_name, product_name, quantity</code> (Türkçe: <code className="font-mono">paket_kodu, paket_adı, ürün, miktar</code>).</div>
                            <div>Her paket satırı ayrı bir satır olarak yazılır — aynı <code className="font-mono">package_code</code> altındaki satırlar aynı pakete gruplanır. Ürünler önce Stok sekmesinde tanımlı olmalıdır.</div>
                        </div>

                        <div className="p-4 flex items-center gap-3 border-b border-neutral-100 flex-wrap">
                            <label className="h-10 px-3 border border-neutral-300 hover:bg-neutral-100 text-sm rounded-sm inline-flex items-center gap-2 cursor-pointer">
                                <Upload size={14}/> Dosya Seç
                                <input
                                    data-testid="package-import-file-input"
                                    type="file" accept=".csv,text/csv" className="hidden"
                                    onChange={(e) => handleFile(e.target.files?.[0])}
                                />
                            </label>
                            {importFileName && (
                                <div className="text-xs text-neutral-500 font-mono truncate">{importFileName} — {importRows.length} satır, {importPreview.length} paket</div>
                            )}
                            <div className="ml-auto flex items-center gap-2">
                                <span className="label-caps text-neutral-500">Mod</span>
                                <div className="flex border border-neutral-300 rounded-sm">
                                    <button
                                        data-testid="package-import-mode-replace"
                                        onClick={() => setImportMode("replace")}
                                        className={`h-9 px-3 text-xs ${importMode === "replace" ? "bg-[#0A0A0A] text-white" : "hover:bg-neutral-100"}`}>
                                        Değiştir (=)
                                    </button>
                                    <button
                                        data-testid="package-import-mode-merge"
                                        onClick={() => setImportMode("merge")}
                                        className={`h-9 px-3 text-xs ${importMode === "merge" ? "bg-[#0A0A0A] text-white" : "hover:bg-neutral-100"}`}>
                                        Birleştir (+)
                                    </button>
                                </div>
                            </div>
                        </div>

                        {anyMissing && (
                            <div className="px-4 py-3 border-b border-neutral-100 bg-[#FFF4E5] text-[#8B5A00] text-xs flex items-start gap-2">
                                <TriangleAlert size={14} className="shrink-0 mt-0.5"/>
                                <div>Bazı ürünler stokta tanımlı değil — bu paketler atlanacaktır. Önce "Stok" sekmesinde eksik ürünleri ekleyin veya CSV'den yükleyin.</div>
                            </div>
                        )}

                        <div className="flex-1 overflow-auto">
                            {importPreview.length === 0 && (
                                <div className="p-10 text-center text-sm text-neutral-500">Bir CSV dosyası seçin. Satırlar paket koduna göre otomatik gruplanır.</div>
                            )}
                            {importPreview.map((g, gi) => (
                                <div key={gi} className={`border-b border-neutral-200 ${g.missing.length ? "bg-[#FFF9EE]" : ""}`}>
                                    <div className="px-4 py-2 flex items-center gap-3">
                                        <div className="w-7 h-7 bg-[#0A0A0A] text-white grid place-items-center font-mono text-xs rounded-sm">{g.code}</div>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium">Paket {g.code}</div>
                                            <div className="text-xs text-neutral-500">{g.name || `${g.items.length} kalem`}</div>
                                        </div>
                                        {g.missing.length > 0 && (
                                            <div className="text-xs text-[#8B5A00] flex items-center gap-1">
                                                <TriangleAlert size={12}/> Eksik: {g.missing.join(", ")}
                                            </div>
                                        )}
                                    </div>
                                    <table className="w-full text-sm">
                                        <tbody>
                                            {g.items.map((it, i) => (
                                                <tr key={i} className="border-t border-neutral-100">
                                                    <td className="px-6 py-1.5">
                                                        {it.found ? (
                                                            <span>{it.product_name}</span>
                                                        ) : (
                                                            <span className="text-[#E50000]">{it.product_name} <span className="text-xs text-neutral-500">(stokta yok)</span></span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-1.5 text-right tabular-nums w-40">{it.quantity} <span className="text-neutral-500 text-xs">{it.unit || ""}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </div>

                        <footer className="p-4 border-t border-neutral-200 flex items-center justify-between">
                            <div className="text-xs text-neutral-500">
                                {importMode === "replace"
                                    ? "Aynı koda sahip paketlerin içeriği tamamen değişir."
                                    : "Aynı koda sahip paketlere yeni ürünler eklenir."}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setImportOpen(false)} className="h-10 px-4 border border-neutral-300 hover:bg-neutral-100 text-sm rounded-sm">İptal</button>
                                <button
                                    data-testid="package-import-submit"
                                    disabled={!importRows.length || importing}
                                    onClick={submitImport}
                                    className={`h-10 px-5 text-sm font-semibold rounded-sm flex items-center gap-2 transition-colors ${
                                        importRows.length && !importing ? "bg-[#0A0A0A] hover:bg-[#0052FF] text-white" : "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                                    }`}>
                                    <Save size={14}/> {importing ? "Yükleniyor…" : `${importPreview.length} Paketi Uygula`}
                                </button>
                            </div>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
}
