import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import api from "@/lib/api";
import ProductsTab from "@/components/customer/ProductsTab";
import PackagesTab from "@/components/customer/PackagesTab";
import OrdersTab from "@/components/customer/OrdersTab";
import MovementsTab from "@/components/customer/MovementsTab";

const TABS = [
    { key: "stok", label: "Stok" },
    { key: "paketler", label: "Paketler" },
    { key: "siparis", label: "Sipariş" },
    { key: "hareketler", label: "Hareketler" },
];

export default function CustomerDetail() {
    const { id, tab } = useParams();
    const nav = useNavigate();
    const active = tab || "stok";
    const [customer, setCustomer] = useState(null);

    useEffect(() => {
        api.get(`/customers`).then((r) => {
            const c = r.data.find((x) => x.id === id);
            setCustomer(c);
        });
    }, [id]);

    if (!customer) return <div className="p-8 text-sm text-neutral-500">Yükleniyor…</div>;

    return (
        <div className="p-6 md:p-8 max-w-[1600px]">
            <Link to="/musteriler" className="text-xs text-neutral-500 hover:text-[#0052FF] inline-flex items-center gap-1 mb-3">
                <ArrowLeft size={12} /> Müşteriler
            </Link>
            <div className="flex items-baseline gap-3 mb-6">
                <div className="label-caps text-neutral-500">Müşteri</div>
                <h1 className="font-display font-black text-3xl md:text-4xl tracking-tight">{customer.name}</h1>
            </div>

            <div className="border-b border-neutral-200 mb-6 flex gap-1">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        data-testid={`tab-${t.key}`}
                        onClick={() => nav(`/musteriler/${id}/${t.key}`)}
                        className={`px-4 h-10 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 ${
                            active === t.key
                                ? "border-[#0052FF] text-[#0A0A0A]"
                                : "border-transparent text-neutral-500 hover:text-[#0A0A0A]"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {active === "stok" && <ProductsTab customerId={id} />}
            {active === "paketler" && <PackagesTab customerId={id} />}
            {active === "siparis" && <OrdersTab customerId={id} />}
            {active === "hareketler" && <MovementsTab customerId={id} customerName={customer.name} />}
        </div>
    );
}
