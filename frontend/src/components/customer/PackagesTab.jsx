import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Save, X, Package } from "lucide-react";
import api from "@/lib/api";

const EMPTY_PKG = { code: "", name: "", items: [] };

export default function PackagesTab({ customerId }) {
    const [packages, setPackages] = useState([]);
    const [products, setProducts] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_PKG);

    const load = async () => {
        const [pk, pr] = await Promise.all([
            api.get(`/customers/${customerId}/packages`),
            api.get(`/customers/${customerId}/products`),
        ]);
        setPackages(pk.data);
        setProducts(pr.data);
    };
    useEffect(() => { load(); }, [customerId]);

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

    const productName = (id) => products.find((p) => p.id === id)?.name || "—";
    const productUnit = (id) => products.find((p) => p.id === id)?.unit || "";

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="label-caps text-neutral-500">Paket Reçeteleri · {packages.length} paket</div>
                <button
                    data-testid="add-package-button"
                    onClick={() => { setShowForm(true); setEditingId(null); setForm({...EMPTY_PKG, items: []}); }}
                    className="h-9 px-3 bg-[#0A0A0A] hover:bg-[#0052FF] text-white text-xs rounded-sm flex items-center gap-1 transition-colors">
                    <Plus size={14}/> Paket Ekle
                </button>
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
        </div>
    );
}
