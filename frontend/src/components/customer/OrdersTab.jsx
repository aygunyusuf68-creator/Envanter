import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShoppingCart, Check, TriangleAlert } from "lucide-react";
import api from "@/lib/api";

export default function OrdersTab({ customerId }) {
    const [packages, setPackages] = useState([]);
    const [packageId, setPackageId] = useState("");
    const [quantity, setQuantity] = useState(1);
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

    useEffect(() => {
        if (!packageId || !quantity) { setPreview(null); return; }
        const t = setTimeout(async () => {
            try {
                const { data } = await api.post(`/customers/${customerId}/orders/preview`, {
                    package_id: packageId, quantity: Number(quantity), note,
                });
                setPreview(data);
            } catch (err) { setPreview(null); }
        }, 200);
        return () => clearTimeout(t);
    }, [customerId, packageId, quantity, note]);

    const canSubmit = preview && preview.lines.length > 0 && preview.insufficient.length === 0;

    const submit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            await api.post(`/customers/${customerId}/orders`, {
                package_id: packageId, quantity: Number(quantity), note,
            });
            toast.success("Sipariş oluşturuldu, stoklar düşüldü");
            setPackageId(""); setQuantity(1); setNote(""); setPreview(null);
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Sipariş oluşturulamadı");
        } finally { setSubmitting(false); }
    };

    return (
        <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-5">
                <div className="bg-white border border-neutral-200 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <ShoppingCart size={16}/>
                        <div className="font-display font-bold text-lg">Yeni Sipariş</div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <div className="label-caps text-neutral-500 mb-1">Paket</div>
                            <select
                                data-testid="order-package-select"
                                value={packageId} onChange={(e) => setPackageId(e.target.value)}
                                className="w-full h-10 px-2 border border-neutral-300 rounded-sm text-sm bg-white">
                                <option value="">Paket seçin…</option>
                                {packages.map((p) => (
                                    <option key={p.id} value={p.id}>{p.code} — {p.name || `${p.items.length} ürün`}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <div className="label-caps text-neutral-500 mb-1">Sipariş Adedi</div>
                            <input
                                data-testid="order-quantity-input"
                                type="number" min="1" value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="w-full h-10 px-3 border border-neutral-300 rounded-sm text-sm tabular-nums"/>
                        </div>
                        <div>
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
            </div>

            <div className="col-span-12 lg:col-span-7">
                <div className="bg-white border border-neutral-200">
                    <header className="h-11 px-4 border-b border-neutral-200 flex items-center gap-2">
                        <div className="label-caps">Önizleme</div>
                        {preview?.insufficient?.length > 0 && (
                            <span className="ml-auto flex items-center gap-1 text-[#E50000] text-xs font-semibold">
                                <TriangleAlert size={12}/> Yetersiz Stok
                            </span>
                        )}
                    </header>
                    {!preview && (
                        <div className="p-8 text-center text-sm text-neutral-500">Paket ve adet seçtiğinizde düşüş önizlemesi burada görünür.</div>
                    )}
                    {preview && (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left label-caps text-neutral-500 border-b border-neutral-200">
                                    <th className="px-4 py-2">Ürün</th>
                                    <th className="px-4 py-2 text-right">Adet/Paket</th>
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
                                            <td className="px-4 py-2">{l.product_name}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{l.per_package}</td>
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
                                <th className="px-4 py-2">Paket</th>
                                <th className="px-4 py-2 text-right">Adet</th>
                                <th className="px-4 py-2">Not</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.length === 0 && (
                                <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-500">Henüz sipariş yok</td></tr>
                            )}
                            {orders.slice(0, 15).map((o) => (
                                <tr key={o.id} className="border-b border-neutral-100" data-testid={`order-row-${o.id}`}>
                                    <td className="px-4 py-2 font-mono text-xs text-neutral-500">{new Date(o.created_at).toLocaleString("tr-TR")}</td>
                                    <td className="px-4 py-2 font-medium">{o.package_code} {o.package_name && <span className="text-neutral-500">· {o.package_name}</span>}</td>
                                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{o.quantity}</td>
                                    <td className="px-4 py-2 text-neutral-600 text-xs">{o.note}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
