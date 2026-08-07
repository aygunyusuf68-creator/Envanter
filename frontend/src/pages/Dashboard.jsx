import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Package, TriangleAlert, Boxes, ShoppingCart, ArrowRight } from "lucide-react";

function Kpi({ label, value, accent, testid }) {
    return (
        <div data-testid={testid} className="col-span-6 md:col-span-3 bg-white border border-neutral-200 p-5">
            <div className="label-caps text-neutral-500">{label}</div>
            <div className={`font-display font-black text-4xl mt-3 tabular-nums ${accent || "text-[#0A0A0A]"}`}>
                {value}
            </div>
        </div>
    );
}

function kindLabel(k) {
    return { in: "Giriş", out: "Çıkış", order: "Sipariş", initial: "Başlangıç", cancel: "İptal" }[k] || k;
}
function kindColor(k) {
    return { in: "text-[#008A00]", out: "text-[#E50000]", order: "text-[#0052FF]", initial: "text-neutral-500", cancel: "text-[#FFB000]" }[k] || "";
}

export default function Dashboard() {
    const [data, setData] = useState(null);

    useEffect(() => {
        api.get("/dashboard/summary").then((r) => setData(r.data));
    }, []);

    if (!data) {
        return (
            <div className="p-8 text-sm text-neutral-500">Panel yükleniyor…</div>
        );
    }

    return (
        <div className="p-6 md:p-8 max-w-[1600px]">
            <div className="mb-8">
                <div className="label-caps text-neutral-500 mb-1">Genel Bakış</div>
                <h1 className="font-display font-black text-3xl md:text-4xl tracking-tight">Yönetim Paneli</h1>
            </div>

            <div className="grid grid-cols-12 gap-3 md:gap-4 mb-8">
                <Kpi testid="kpi-customers" label="Müşteri" value={data.total_customers} />
                <Kpi testid="kpi-products" label="Toplam Ürün" value={data.total_products} />
                <Kpi testid="kpi-orders" label="Toplam Sipariş" value={data.total_orders} />
                <Kpi testid="kpi-lowstock" label="Düşük Stok"
                    value={data.low_stock_count}
                    accent={data.low_stock_count > 0 ? "text-[#E50000]" : ""}
                />
            </div>

            <div className="grid grid-cols-12 gap-4">
                <section className="col-span-12 lg:col-span-7 bg-white border border-neutral-200">
                    <header className="h-11 px-4 flex items-center justify-between border-b border-neutral-200">
                        <div className="flex items-center gap-2">
                            <Boxes size={14} strokeWidth={2} />
                            <div className="label-caps">Müşteri Özeti</div>
                        </div>
                    </header>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left label-caps text-neutral-500 border-b border-neutral-200">
                                <th className="px-4 py-2">Müşteri</th>
                                <th className="px-4 py-2 text-right">Ürün</th>
                                <th className="px-4 py-2 text-right">Paket</th>
                                <th className="px-4 py-2 text-right">Sipariş</th>
                                <th className="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.per_customer.map((c) => (
                                <tr key={c.customer.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors duration-150">
                                    <td className="px-4 py-2 font-medium">{c.customer.name}</td>
                                    <td className="px-4 py-2 text-right tabular-nums">{c.products}</td>
                                    <td className="px-4 py-2 text-right tabular-nums">{c.packages}</td>
                                    <td className="px-4 py-2 text-right tabular-nums">{c.orders}</td>
                                    <td className="px-4 py-2 text-right">
                                        <Link
                                            to={`/musteriler/${c.customer.id}`}
                                            data-testid={`dashboard-open-customer-${c.customer.id}`}
                                            className="inline-flex items-center gap-1 text-[#0052FF] hover:underline"
                                        >
                                            Aç <ArrowRight size={12} />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                <section className="col-span-12 lg:col-span-5 bg-white border border-neutral-200">
                    <header className="h-11 px-4 flex items-center gap-2 border-b border-neutral-200">
                        <TriangleAlert size={14} strokeWidth={2} className="text-[#E50000]" />
                        <div className="label-caps">Düşük Stok</div>
                    </header>
                    <div className="p-2 max-h-72 overflow-auto">
                        {data.low_stock.length === 0 && (
                            <div className="p-6 text-sm text-neutral-500 text-center">Düşük stok yok</div>
                        )}
                        {data.low_stock.map((p) => (
                            <div key={p.id} className="flex items-center justify-between px-3 py-2 border-b border-neutral-100">
                                <div className="text-sm truncate">{p.name}</div>
                                <div className="text-sm tabular-nums text-[#E50000] font-medium">
                                    {p.quantity} / {p.low_stock_threshold}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="col-span-12 bg-white border border-neutral-200">
                    <header className="h-11 px-4 flex items-center gap-2 border-b border-neutral-200">
                        <ShoppingCart size={14} strokeWidth={2} />
                        <div className="label-caps">Son Hareketler</div>
                    </header>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left label-caps text-neutral-500 border-b border-neutral-200">
                                <th className="px-4 py-2">Tarih</th>
                                <th className="px-4 py-2">Tür</th>
                                <th className="px-4 py-2">Ürün</th>
                                <th className="px-4 py-2 text-right">Değişim</th>
                                <th className="px-4 py-2">Not</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.recent_movements.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-500">Henüz hareket yok</td></tr>
                            )}
                            {data.recent_movements.map((m) => (
                                <tr key={m.id} className="border-b border-neutral-100">
                                    <td className="px-4 py-2 font-mono text-xs text-neutral-500">{new Date(m.created_at).toLocaleString("tr-TR")}</td>
                                    <td className={`px-4 py-2 label-caps ${kindColor(m.kind)}`}>{kindLabel(m.kind)}</td>
                                    <td className="px-4 py-2">{m.product_name}</td>
                                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${m.delta < 0 ? "text-[#E50000]" : "text-[#008A00]"}`}>
                                        {m.delta > 0 ? "+" : ""}{m.delta}
                                    </td>
                                    <td className="px-4 py-2 text-neutral-600 text-xs">{m.note}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </div>
        </div>
    );
}
