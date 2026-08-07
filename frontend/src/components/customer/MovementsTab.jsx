import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import api, { API } from "@/lib/api";

const KIND = { in: "Giriş", out: "Çıkış", order: "Sipariş", initial: "Başlangıç" };
const COLOR = { in: "text-[#008A00]", out: "text-[#E50000]", order: "text-[#0052FF]", initial: "text-neutral-500" };

export default function MovementsTab({ customerId, customerName }) {
    const [items, setItems] = useState([]);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        api.get(`/customers/${customerId}/movements`).then((r) => setItems(r.data));
    }, [customerId]);

    const filtered = filter === "all" ? items : items.filter((m) => m.kind === filter);

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1 border border-neutral-200 bg-white rounded-sm">
                    {[
                        { k: "all", l: "Tümü" },
                        { k: "in", l: "Giriş" },
                        { k: "out", l: "Çıkış" },
                        { k: "order", l: "Sipariş" },
                        { k: "initial", l: "Başlangıç" },
                    ].map((t) => (
                        <button
                            key={t.k}
                            data-testid={`filter-${t.k}`}
                            onClick={() => setFilter(t.k)}
                            className={`h-9 px-3 text-xs transition-colors ${filter === t.k ? "bg-[#0A0A0A] text-white" : "text-neutral-600 hover:bg-neutral-50"}`}>
                            {t.l}
                        </button>
                    ))}
                </div>
                <a
                    href={`${API}/customers/${customerId}/export/movements`}
                    data-testid="export-movements-csv"
                    className="h-9 px-3 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm flex items-center gap-1">
                    <Download size={12}/> CSV İndir
                </a>
            </div>

            <div className="bg-white border border-neutral-200 overflow-x-auto">
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
                        {filtered.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-10 text-center text-neutral-500">Kayıt yok</td></tr>
                        )}
                        {filtered.map((m) => (
                            <tr key={m.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors duration-150">
                                <td className="px-4 py-2 font-mono text-xs text-neutral-500">{new Date(m.created_at).toLocaleString("tr-TR")}</td>
                                <td className={`px-4 py-2 label-caps ${COLOR[m.kind]}`}>{KIND[m.kind] || m.kind}</td>
                                <td className="px-4 py-2 font-medium">{m.product_name}</td>
                                <td className={`px-4 py-2 text-right tabular-nums font-semibold ${m.delta < 0 ? "text-[#E50000]" : "text-[#008A00]"}`}>
                                    {m.delta > 0 ? "+" : ""}{m.delta}
                                </td>
                                <td className="px-4 py-2 text-neutral-600 text-xs">{m.note}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
