import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Boxes, Lock } from "lucide-react";

const BG = "https://images.unsplash.com/photo-1565610222536-ef125c59da2e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDB8MHwxfHNlYXJjaHwzfHxtb2Rlcm4lMjB3YXJlaG91c2UlMjBhcmNoaXRlY3R1cmV8ZW58MHx8fHwxNzg2MDkwMzYzfDA&ixlib=rb-4.1.0&q=85";

function fmtErr(d) {
    if (!d) return "Giriş başarısız";
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((e) => e?.msg || JSON.stringify(e)).join(" ");
    return d.msg || String(d);
}

export default function Login() {
    const [email, setEmail] = useState("aygunyusuf68@gmail.com");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const nav = useNavigate();

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await login(email, password);
            toast.success("Giriş başarılı");
            nav("/");
        } catch (err) {
            toast.error(fmtErr(err?.response?.data?.detail) || err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid md:grid-cols-2 bg-[#F8F9FA]">
            <div className="hidden md:block relative overflow-hidden">
                <img src={BG} alt="warehouse" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-[#0A0A0A]/70" />
                <div className="relative h-full p-12 flex flex-col justify-between text-white">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-white text-[#0A0A0A] grid place-items-center rounded-sm">
                            <Boxes size={20} strokeWidth={2.2} />
                        </div>
                        <div className="font-display font-black text-lg tracking-tight">STOKPAKET</div>
                    </div>
                    <div>
                        <div className="label-caps text-white/60 mb-3">Kurumsal Envanter</div>
                        <h1 className="font-display font-black text-4xl leading-[1.05] tracking-tight">
                            6 müşteri.<br/>Bağımsız stoklar.<br/>Otomatik reçete.
                        </h1>
                        <p className="mt-6 text-sm text-white/70 max-w-md">
                            Paket bazlı sipariş girişinde tüm ürünler otomatik düşer, her hareket kayıt altında kalır.
                        </p>
                    </div>
                    <div className="text-xs text-white/40 font-mono">v1.0 · production</div>
                </div>
            </div>

            <div className="flex items-center justify-center p-6 md:p-16">
                <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
                    <div className="label-caps text-neutral-500 mb-3">Oturum Aç</div>
                    <h2 className="font-display font-black text-3xl tracking-tight mb-8">
                        Yönetim Paneli
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="label-caps text-neutral-500 block mb-2">E-posta</label>
                            <input
                                data-testid="login-email-input"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full h-11 px-3 bg-white border border-neutral-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                            />
                        </div>
                        <div>
                            <label className="label-caps text-neutral-500 block mb-2">Şifre</label>
                            <input
                                data-testid="login-password-input"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-11 px-3 bg-white border border-neutral-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                            />
                        </div>
                    </div>

                    <button
                        data-testid="login-submit-button"
                        disabled={loading}
                        type="submit"
                        className="mt-6 w-full h-11 bg-[#0A0A0A] hover:bg-[#0052FF] text-white font-semibold text-sm rounded-sm transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Lock size={14} strokeWidth={2.2} />
                        {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
                    </button>

                    <p className="mt-6 text-xs text-neutral-500 font-mono">
                        Yönetici hesabı: aygunyusuf68@gmail.com / admin123
                    </p>
                </form>
            </div>
        </div>
    );
}
