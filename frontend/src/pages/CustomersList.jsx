import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Pencil, Check, X, ArrowRight, Users, Plus, Trash2 } from "lucide-react";
import api from "@/lib/api";

export default function CustomersList() {
    const [items, setItems] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState("");
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [confirmText, setConfirmText] = useState("");
    const [deleting, setDeleting] = useState(false);

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

    const create = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return toast.error("Müşteri adı gerekli");
        try {
            await api.post("/customers", { name: newName.trim() });
            toast.success("Müşteri eklendi");
            setCreating(false); setNewName("");
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Ekleme başarısız");
        }
    };

    const doDelete = async () => {
        if (confirmText.trim() !== deleteTarget.name) {
            toast.error("Onay metni müşteri adıyla eşleşmiyor");
            return;
        }
        setDeleting(true);
        try {
            const { data } = await api.delete(`/customers/${deleteTarget.id}`);
            const d = data.deleted;
            toast.success(`Müşteri silindi (${d.products} ürün, ${d.packages} paket, ${d.orders} sipariş, ${d.movements} hareket)`);
            setDeleteTarget(null); setConfirmText("");
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Silme başarısız");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-[1200px]">
            <div className="mb-6 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Users size={18} />
                    <h1 className="font-display font-black text-3xl md:text-4xl tracking-tight">Müşteriler</h1>
                </div>
                <button
                    data-testid="add-customer-button"
                    onClick={() => { setCreating(true); setNewName(""); }}
                    className="h-10 px-4 bg-[#0A0A0A] hover:bg-[#0052FF] text-white text-sm rounded-sm flex items-center gap-2 transition-colors"
                >
                    <Plus size={14} /> Müşteri Ekle
                </button>
            </div>
            <p className="text-sm text-neutral-600 mb-6">Her müşterinin stok, paket ve sipariş kayıtları bağımsızdır. Müşteri silindiğinde o müşteriye ait tüm veriler geri getirilemez şekilde kaldırılır.</p>

            {creating && (
                <form onSubmit={create} className="bg-white border border-neutral-200 p-4 mb-4 flex items-end gap-3" data-testid="customer-create-form">
                    <div className="flex-1">
                        <div className="label-caps text-neutral-500 mb-1">Yeni Müşteri Adı</div>
                        <input
                            data-testid="customer-create-input"
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="w-full h-10 px-3 border border-neutral-300 rounded-sm text-sm"
                            placeholder="Örn: Otoyol Servis A.Ş."
                        />
                    </div>
                    <button type="button" onClick={() => setCreating(false)} className="h-10 px-4 border border-neutral-300 hover:bg-neutral-100 text-sm rounded-sm flex items-center gap-1">
                        <X size={14}/> İptal
                    </button>
                    <button type="submit" data-testid="customer-create-submit" className="h-10 px-4 bg-[#0A0A0A] hover:bg-[#0052FF] text-white text-sm rounded-sm flex items-center gap-1 transition-colors">
                        <Check size={14}/> Ekle
                    </button>
                </form>
            )}

            <div className="bg-white border border-neutral-200">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left label-caps text-neutral-500 border-b border-neutral-200">
                            <th className="px-4 py-2 w-12">#</th>
                            <th className="px-4 py-2">Ad</th>
                            <th className="px-4 py-2 w-80"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && (
                            <tr><td colSpan={3} className="px-4 py-10 text-center text-neutral-500">Henüz müşteri yok. Sağ üstteki "Müşteri Ekle" ile başlayın.</td></tr>
                        )}
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
                                            <button
                                                data-testid={`customer-delete-${c.id}`}
                                                onClick={() => { setDeleteTarget(c); setConfirmText(""); }}
                                                className="h-8 px-3 border border-neutral-300 hover:bg-[#E50000] hover:text-white hover:border-[#E50000] text-xs rounded-sm flex items-center gap-1 transition-colors"
                                            >
                                                <Trash2 size={12} /> Sil
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

            {deleteTarget && (
                <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" onClick={() => !deleting && setDeleteTarget(null)}>
                    <div className="bg-white border border-neutral-200 max-w-md w-full" onClick={(e)=>e.stopPropagation()} data-testid="customer-delete-dialog">
                        <header className="h-12 px-4 border-b border-neutral-200 flex items-center gap-2">
                            <Trash2 size={16} className="text-[#E50000]"/>
                            <div className="font-display font-bold">Müşteri Sil</div>
                            <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="ml-auto h-8 w-8 grid place-items-center hover:bg-neutral-100 rounded-sm disabled:opacity-50"><X size={14}/></button>
                        </header>
                        <div className="p-5 space-y-3 text-sm">
                            <div className="p-3 bg-[#FEE] border border-[#E50000]/30 text-[#B00000] rounded-sm">
                                <div className="font-semibold mb-1">Bu işlem geri alınamaz</div>
                                <div className="text-xs">"<span className="font-mono font-semibold">{deleteTarget.name}</span>" müşterisine ait <strong>tüm ürünler, paketler, siparişler ve stok hareketleri kalıcı olarak silinir</strong>.</div>
                            </div>
                            <div>
                                <div className="label-caps text-neutral-500 mb-1">Onaylamak için müşteri adını yazın</div>
                                <input
                                    data-testid="customer-delete-confirm-input"
                                    autoFocus
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    placeholder={deleteTarget.name}
                                    className="w-full h-10 px-3 border border-neutral-300 rounded-sm text-sm"
                                />
                            </div>
                        </div>
                        <footer className="p-4 border-t border-neutral-200 flex justify-end gap-2">
                            <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="h-10 px-4 border border-neutral-300 hover:bg-neutral-100 text-sm rounded-sm">İptal</button>
                            <button
                                data-testid="customer-delete-confirm"
                                onClick={doDelete}
                                disabled={deleting || confirmText.trim() !== deleteTarget.name}
                                className={`h-10 px-5 text-sm font-semibold rounded-sm flex items-center gap-2 transition-colors ${
                                    confirmText.trim() === deleteTarget.name && !deleting
                                        ? "bg-[#E50000] hover:bg-[#B00000] text-white"
                                        : "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                                }`}>
                                <Trash2 size={14}/> {deleting ? "Siliniyor…" : "Kalıcı Olarak Sil"}
                            </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
}
