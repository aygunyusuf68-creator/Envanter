import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Save, X, Download, Minus, PlusCircle } from "lucide-react";
import api from "@/lib/api";
import { API } from "@/lib/api";

const EMPTY = { name: "", sku: "", unit: "adet", quantity: 0, low_stock_threshold: 0 };

export default function ProductsTab({ customerId }) {
    const [items, setItems] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [editingId, setEditingId] = useState(null);
    const [adjustFor, setAdjustFor] = useState(null); // product
    const [adjustDelta, setAdjustDelta] = useState("");
    const [adjustNote, setAdjustNote] = useState("");

    const load = () => api.get(`/customers/${customerId}/products`).then((r) => setItems(r.data));
    useEffect(() => { load(); }, [customerId]);

    const submit = async (e) => {
        e.preventDefault();
        const payload = {
            name: form.name.trim(),
            sku: form.sku,
            unit: form.unit,
            quantity: Number(form.quantity) || 0,
            low_stock_threshold: Number(form.low_stock_threshold) || 0,
        };
        if (!payload.name) return toast.error("Ürün adı gerekli");
        try {
            if (editingId) {
                await api.patch(`/customers/${customerId}/products/${editingId}`, payload);
                toast.success("Ürün güncellendi");
            } else {
                await api.post(`/customers/${customerId}/products`, payload);
                toast.success("Ürün eklendi");
            }
            setShowForm(false); setEditingId(null); setForm(EMPTY);
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "İşlem başarısız");
        }
    };

    const del = async (p) => {
        if (!window.confirm(`"${p.name}" silinsin mi?`)) return;
        await api.delete(`/customers/${customerId}/products/${p.id}`);
        toast.success("Ürün silindi");
        load();
    };

    const submitAdjust = async (sign) => {
        const raw = Number(adjustDelta);
        if (!raw || raw <= 0) return toast.error("Miktar giriniz");
        try {
            await api.post(`/customers/${customerId}/products/${adjustFor.id}/adjust`, {
                delta: sign * raw, note: adjustNote || (sign > 0 ? "Manuel giriş" : "Manuel çıkış"),
            });
            toast.success("Stok güncellendi");
            setAdjustFor(null); setAdjustDelta(""); setAdjustNote("");
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Hata");
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="label-caps text-neutral-500">Ürün Envanteri · {items.length} kalem</div>
                <div className="flex gap-2">
                    <a
                        href={`${API}/customers/${customerId}/export/products`}
                        data-testid="export-products-csv"
                        className="h-9 px-3 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm flex items-center gap-1"
                    >
                        <Download size={12} /> CSV İndir
                    </a>
                    <button
                        data-testid="add-product-button"
                        onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY); }}
                        className="h-9 px-3 bg-[#0A0A0A] hover:bg-[#0052FF] text-white text-xs rounded-sm flex items-center gap-1 transition-colors"
                    >
                        <Plus size={14} /> Ürün Ekle
                    </button>
                </div>
            </div>

            {showForm && (
                <form onSubmit={submit} className="bg-white border border-neutral-200 p-4 mb-4 grid grid-cols-12 gap-3 items-end" data-testid="product-form">
                    <div className="col-span-12 md:col-span-4">
                        <div className="label-caps text-neutral-500 mb-1">Ad</div>
                        <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full h-9 px-2 border border-neutral-300 rounded-sm text-sm" data-testid="product-name-input"/>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                        <div className="label-caps text-neutral-500 mb-1">Kod</div>
                        <input value={form.sku} onChange={(e) => setForm({...form, sku: e.target.value})} className="w-full h-9 px-2 border border-neutral-300 rounded-sm text-sm"/>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                        <div className="label-caps text-neutral-500 mb-1">Birim</div>
                        <input value={form.unit} onChange={(e) => setForm({...form, unit: e.target.value})} className="w-full h-9 px-2 border border-neutral-300 rounded-sm text-sm"/>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                        <div className="label-caps text-neutral-500 mb-1">{editingId ? "Mevcut Stok" : "Başlangıç"}</div>
                        <input type="number" step="any" value={form.quantity} onChange={(e) => setForm({...form, quantity: e.target.value})} className="w-full h-9 px-2 border border-neutral-300 rounded-sm text-sm tabular-nums" data-testid="product-qty-input"/>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                        <div className="label-caps text-neutral-500 mb-1">Düşük Stok</div>
                        <input type="number" step="any" value={form.low_stock_threshold} onChange={(e) => setForm({...form, low_stock_threshold: e.target.value})} className="w-full h-9 px-2 border border-neutral-300 rounded-sm text-sm tabular-nums"/>
                    </div>
                    <div className="col-span-12 flex gap-2 justify-end">
                        <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="h-9 px-3 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm flex items-center gap-1">
                            <X size={12}/> İptal
                        </button>
                        <button type="submit" data-testid="product-submit" className="h-9 px-4 bg-[#0A0A0A] hover:bg-[#0052FF] text-white text-xs rounded-sm flex items-center gap-1 transition-colors">
                            <Save size={12}/> {editingId ? "Güncelle" : "Ekle"}
                        </button>
                    </div>
                </form>
            )}

            <div className="bg-white border border-neutral-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left label-caps text-neutral-500 border-b border-neutral-200 sticky top-0 bg-white">
                            <th className="px-4 py-2">Ad</th>
                            <th className="px-4 py-2">Kod</th>
                            <th className="px-4 py-2">Birim</th>
                            <th className="px-4 py-2 text-right">Stok</th>
                            <th className="px-4 py-2 text-right">Düşük Eşik</th>
                            <th className="px-4 py-2 text-right w-64">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-neutral-500">Henüz ürün yok</td></tr>
                        )}
                        {items.map((p) => {
                            const low = p.low_stock_threshold > 0 && p.quantity <= p.low_stock_threshold;
                            return (
                                <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors duration-150" data-testid={`product-row-${p.id}`}>
                                    <td className="px-4 py-2 font-medium">{p.name}</td>
                                    <td className="px-4 py-2 font-mono text-xs text-neutral-500">{p.sku || "—"}</td>
                                    <td className="px-4 py-2 text-neutral-600">{p.unit}</td>
                                    <td className={`px-4 py-2 text-right tabular-nums font-semibold ${low ? "text-[#E50000]" : ""}`}>
                                        {p.quantity}
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{p.low_stock_threshold}</td>
                                    <td className="px-4 py-2">
                                        <div className="flex gap-1 justify-end">
                                            <button
                                                data-testid={`product-adjust-${p.id}`}
                                                onClick={() => { setAdjustFor(p); setAdjustDelta(""); setAdjustNote(""); }}
                                                className="h-8 px-2 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm">Stok +/−</button>
                                            <button
                                                data-testid={`product-edit-${p.id}`}
                                                onClick={() => { setEditingId(p.id); setShowForm(true); setForm({name:p.name,sku:p.sku||"",unit:p.unit||"adet",quantity:p.quantity,low_stock_threshold:p.low_stock_threshold||0}); }}
                                                className="h-8 w-8 border border-neutral-300 hover:bg-neutral-100 grid place-items-center rounded-sm"><Pencil size={12}/></button>
                                            <button
                                                data-testid={`product-delete-${p.id}`}
                                                onClick={() => del(p)}
                                                className="h-8 w-8 border border-neutral-300 hover:bg-[#E50000] hover:text-white grid place-items-center rounded-sm transition-colors"><Trash2 size={12}/></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {adjustFor && (
                <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" onClick={() => setAdjustFor(null)}>
                    <div className="bg-white border border-neutral-200 max-w-md w-full p-6" onClick={(e)=>e.stopPropagation()}>
                        <div className="label-caps text-neutral-500 mb-1">{adjustFor.name}</div>
                        <h3 className="font-display font-bold text-xl mb-4">Stok Düzeltme</h3>
                        <div className="text-sm text-neutral-600 mb-3">Mevcut: <span className="font-semibold tabular-nums">{adjustFor.quantity}</span> {adjustFor.unit}</div>
                        <input
                            data-testid="adjust-delta-input"
                            type="number" step="any" autoFocus placeholder="Miktar"
                            value={adjustDelta} onChange={(e)=>setAdjustDelta(e.target.value)}
                            className="w-full h-10 px-3 border border-neutral-300 rounded-sm text-sm mb-2"
                        />
                        <input
                            placeholder="Not (opsiyonel)"
                            value={adjustNote} onChange={(e)=>setAdjustNote(e.target.value)}
                            className="w-full h-10 px-3 border border-neutral-300 rounded-sm text-sm mb-4"
                        />
                        <div className="flex gap-2">
                            <button data-testid="adjust-remove" onClick={()=>submitAdjust(-1)} className="flex-1 h-10 border border-[#E50000] text-[#E50000] hover:bg-[#E50000] hover:text-white text-sm rounded-sm flex items-center justify-center gap-1 transition-colors">
                                <Minus size={14}/> Çıkış
                            </button>
                            <button data-testid="adjust-add" onClick={()=>submitAdjust(1)} className="flex-1 h-10 bg-[#008A00] hover:bg-[#006D00] text-white text-sm rounded-sm flex items-center justify-center gap-1">
                                <PlusCircle size={14}/> Giriş
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
