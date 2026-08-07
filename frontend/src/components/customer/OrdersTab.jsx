import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShoppingCart, Check, TriangleAlert, Plus, Trash2, XCircle } from "lucide-react";
import api from "@/lib/api";

export default function OrdersTab({ customerId }) {
    const [packages, setPackages] = useState([]);
    const [rows, setRows] = useState([{ package_id: "", quantity: 1 }]);
    const [note, setNote] = useState("");
    const [preview, setPreview] = useState(null);
    const [orders, setOrders] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const load = async () => {
        const [pk, or] = await Promise.all([
            api.get(`/customers/${customerId}/packages`),
            api.get(`/customers/${customerId}/orders`),
        ]);
        setPackages(pk.data);
        setOrders(or.data);
    };
    useEffect(() => { load(); }, [customerId]);

    const validRows = rows.filter((r) => r.package_id && Number(r.quantity) > 0);

    useEffect(() => {
        if (validRows.length === 0) { setPreview(null); return; }
        const items = validRows.map((r) => ({ package_id: r.package_id, quantity: Number(r.quantity) }));
        const t = setTimeout(async () => {
            try {
                const { data } = await api.post(`/customers/${customerId}/orders/preview`, { items, note });
                setPreview(data);
            } catch (err) { setPreview(null); }
        }, 200);
        return () => clearTimeout(t);
    // eslint-disable-next-line
    }, [customerId, JSON.stringify(rows), note]);

    const canSubmit = preview && preview.lines.length > 0 && preview.insufficient.length === 0 && validRows.length > 0;

    const submit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            const items = validRows.map((r) => ({ package_id: r.package_id, quantity: Number(r.quantity) }));
            await api.post(`/customers/${customerId}/orders`, { items, note });
            toast.success("Sipariş oluşturuldu, stoklar düşüldü");
            setRows([{ package_id: "", quantity: 1 }]);
            setNote("");
            setPreview(null);
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Sipariş oluşturulamadı");
        } finally { setSubmitting(false); }
    };

    const cancel = async (o) => {
        if (!window.confirm(`Sipariş "${o.summary || o.package_code}" iptal edilecek ve düşen stoklar geri yüklenecek. Onaylıyor musunuz?`)) return;
        try {
            await api.post(`/customers/${customerId}/orders/${o.id}/cancel`);
            toast.success("Sipariş iptal edildi, stoklar geri yüklendi");
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "İptal başarısız");
        }
    };

    const addRow = () => setRows([...rows, { package_id: "", quantity: 1 }]);
    const removeRow = (i) => setRows(rows.length === 1 ? [{ package_id: "", quantity: 1 }] : rows.filter((_, idx) => idx !== i));
    const updateRow = (i, patch) => {
        const next = [...rows]; next[i] = { ...next[i], ...patch }; setRows(next);
    };

    return (
        <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-5">
                <div className="bg-white border border-neutral-200 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <ShoppingCart size={16}/>
                        <div className="font-display font-bold text-lg">Yeni Sipariş</div>
                    </div>

                    <div className="space-y-2 mb-3">
                        <div className="grid grid-cols-12 gap-2 label-caps text-neutral-500">
                            <div className="col-span-8">Paket</div>
                            <div className="col-span-3 text-right">Adet</div>
                            <div className="col-span-1"></div>
                        </div>
                        {rows.map((r, i) => (
                            <div key={i} className="grid grid-cols-12 gap-2 items-center">
                                <select
                                    data-testid={`order-package-select-${i}`}
                                    value={r.package_id}
                                    onChange={(e) => updateRow(i, { package_id: e.target.value })}
                                    className="col-span-8 h-10 px-2 border border-neutral-300 rounded-sm text-sm bg-white">
                                    <option value="">Paket seçin…</option>
                                    {packages.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.code}{p.name ? ` — ${p.name}` : ` — ${p.items.length} ürün`}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    data-testid={`order-quantity-input-${i}`}
                                    type="number" min="1"
                                    value={r.quantity}
                                    onChange={(e) => updateRow(i, { quantity: e.target.value })}
                                    className="col-span-3 h-10 px-2 border border-neutral-300 rounded-sm text-sm tabular-nums text-right"/>
                                <button
                                    onClick={() => removeRow(i)}
                                    data-testid={`order-row-remove-${i}`}
                                    className="col-span-1 h-10 border border-neutral-300 hover:bg-[#E50000] hover:text-white rounded-sm grid place-items-center transition-colors">
                                    <Trash2 size={12}/>
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={addRow}
                            data-testid="order-add-row"
                            className="h-9 px-3 border border-dashed border-neutral-400 hover:border-[#0052FF] hover:text-[#0052FF] text-xs rounded-sm flex items-center gap-1 w-full justify-center transition-colors">
                            <Plus size={12}/> Paket Ekle
                        </button>
                    </div>

                    <div className="mb-4">
                        <div className="label-caps text-neutral-500 mb-1">Not</div>
                        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full h-10 px-3 border border-neutral-300 rounded-sm text-sm"/>
                    </div>

                    <button
                        data-testid="order-submit-button"
                        onClick={submit}
                        disabled={!canSubmit || submitting}
                        className={`w-full h-11 text-sm font-semibold rounded-sm flex items-center justify-center gap-2 transition-colors ${
                            canSubmit ? "bg-[#0A0A0A] hover:bg-[#0052FF] text-white" : "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                        }`}>
                        <Check size={14}/> {submitting ? "Kaydediliyor…" : "Siparişi Onayla"}
                    </button>
                </div>
            </div>

            <div className="col-span-12 lg:col-span-7">
                <div className="bg-white border border-neutral-200">
                    <header className="h-11 px-4 border-b border-neutral-200 flex items-center gap-2">
                        <div className="label-caps">Önizleme</div>
                        {preview?.packages?.length > 0 && (
                            <span className="text-xs text-neutral-500">
                                {preview.packages.map((p) => `${p.code} × ${p.quantity}`).join(" · ")}
                            </span>
                        )}
                        {preview?.insufficient?.length > 0 && (
                            <span className="ml-auto flex items-center gap-1 text-[#E50000] text-xs font-semibold">
                                <TriangleAlert size={12}/> Yetersiz Stok
                            </span>
                        )}
                    </header>
                    {!preview && (
                        <div className="p-8 text-center text-sm text-neutral-500">Paket ve adet seçtiğinizde toplam düşüş önizlemesi burada görünür.</div>
                    )}
                    {preview && (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left label-caps text-neutral-500 border-b border-neutral-200">
                                    <th className="px-4 py-2">Ürün</th>
                                    <th className="px-4 py-2">Kırılım</th>
                                    <th className="px-4 py-2 text-right">Toplam</th>
                                    <th className="px-4 py-2 text-right">Mevcut</th>
                                    <th className="px-4 py-2 text-right">Sonra</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.lines.map((l) => {
                                    const after = l.available - l.required;
                                    return (
                                        <tr key={l.product_id} className={`border-b border-neutral-100 ${!l.sufficient ? "bg-red-50" : ""}`}>
                                            <td className="px-4 py-2 font-medium">{l.product_name}</td>
                                            <td className="px-4 py-2 text-xs text-neutral-500">
                                                {l.breakdown?.map((b, i) => (
                                                    <div key={i} className="tabular-nums">
                                                        {b.package_code}: {b.per_package} × {b.package_quantity} = <span className="font-medium text-neutral-700">{b.subtotal}</span>
                                                    </div>
                                                ))}
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums font-semibold">{l.required}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{l.available}</td>
                                            <td className={`px-4 py-2 text-right tabular-nums font-semibold ${!l.sufficient ? "text-[#E50000]" : ""}`}>{after}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="bg-white border border-neutral-200 mt-4">
                    <header className="h-11 px-4 border-b border-neutral-200 flex items-center">
                        <div className="label-caps">Son Siparişler</div>
                    </header>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left label-caps text-neutral-500 border-b border-neutral-200">
                                <th className="px-4 py-2">Tarih</th>
                                <th className="px-4 py-2">Paketler</th>
                                <th className="px-4 py-2">Not</th>
                                <th className="px-4 py-2 text-right w-32">Durum</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.length === 0 && (
                                <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-500">Henüz sipariş yok</td></tr>
                            )}
                            {orders.slice(0, 30).map((o) => {
                                const cancelled = o.status === "cancelled";
                                // Support legacy single-package orders too
                                const label = o.summary
                                    ? o.summary
                                    : (o.package_code ? `${o.package_code} × ${o.quantity}` : "—");
                                return (
                                    <tr key={o.id} className="border-b border-neutral-100" data-testid={`order-row-${o.id}`}>
                                        <td className="px-4 py-2 font-mono text-xs text-neutral-500 align-top">{new Date(o.created_at).toLocaleString("tr-TR")}</td>
                                        <td className="px-4 py-2 align-top">
                                            <div className={`font-medium ${cancelled ? "line-through text-neutral-400" : ""}`}>{label}</div>
                                            {o.packages && o.packages.length > 1 && (
                                                <div className="text-xs text-neutral-500 mt-0.5">{o.packages.length} paket</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-neutral-600 text-xs align-top">{o.note}</td>
                                        <td className="px-4 py-2 text-right align-top">
                                            {cancelled ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-[#E50000] label-caps">İptal</span>
                                            ) : (
                                                <button
                                                    data-testid={`order-cancel-${o.id}`}
                                                    onClick={() => cancel(o)}
                                                    className="h-8 px-3 border border-[#E50000] text-[#E50000] hover:bg-[#E50000] hover:text-white text-xs rounded-sm inline-flex items-center gap-1 transition-colors">
                                                    <XCircle size={12}/> İptal Et
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
