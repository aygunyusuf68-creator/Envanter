import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Pencil, Check, X, ArrowRight, Users } from "lucide-react";
import api from "@/lib/api";

export default function CustomersList() {
    const [items, setItems] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState("");

    const load = () => api.get("/customers").then((r) => setItems(r.data));
    useEffect(() => { load(); }, []);

    const save = async (id) => {
        try {
            await api.patch(`/customers/${id}`, { name: draft.trim() });
            toast.success("Müşteri adı güncellendi");
            setEditingId(null);
            load();
        } catch (e) {
            toast.error("Güncelleme başarısız");
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-[1200px]">
            <div className="mb-6 flex items-center gap-2">
                <Users size={18} />
                <h1 className="font-display font-black text-3xl md:text-4xl tracking-tight">Müşteriler</h1>
            </div>
            <p className="text-sm text-neutral-600 mb-6">Her müşterinin stok, paket ve sipariş kayıtları bağımsızdır.</p>

            <div className="bg-white border border-neutral-200">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left label-caps text-neutral-500 border-b border-neutral-200">
                            <th className="px-4 py-2 w-12">#</th>
                            <th className="px-4 py-2">Ad</th>
                            <th className="px-4 py-2 w-40"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((c, i) => (
                            <tr key={c.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors duration-150">
                                <td className="px-4 py-3 tabular-nums text-neutral-500">{i + 1}</td>
                                <td className="px-4 py-3">
                                    {editingId === c.id ? (
                                        <div className="flex gap-2">
                                            <input
                                                data-testid={`customer-name-input-${c.id}`}
                                                autoFocus
                                                value={draft}
                                                onChange={(e) => setDraft(e.target.value)}
                                                className="h-9 px-2 border border-neutral-300 rounded-sm text-sm w-64"
                                            />
                                            <button
                                                data-testid={`customer-save-${c.id}`}
                                                onClick={() => save(c.id)}
                                                className="h-9 px-3 bg-[#0A0A0A] hover:bg-[#0052FF] text-white text-xs rounded-sm flex items-center gap-1"
                                            >
                                                <Check size={14} /> Kaydet
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="h-9 px-3 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm flex items-center gap-1"
                                            >
                                                <X size={14} /> İptal
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="font-medium">{c.name}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {editingId !== c.id && (
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                data-testid={`customer-edit-${c.id}`}
                                                onClick={() => { setEditingId(c.id); setDraft(c.name); }}
                                                className="h-8 px-3 border border-neutral-300 hover:bg-neutral-100 text-xs rounded-sm flex items-center gap-1"
                                            >
                                                <Pencil size={12} /> Adı Değiştir
                                            </button>
                                            <Link
                                                to={`/musteriler/${c.id}`}
                                                data-testid={`customer-open-${c.id}`}
                                                className="h-8 px-3 bg-[#0A0A0A] hover:bg-[#0052FF] text-white text-xs rounded-sm flex items-center gap-1 transition-colors"
                                            >
                                                Aç <ArrowRight size={12} />
                                            </Link>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
