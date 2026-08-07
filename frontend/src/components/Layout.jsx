import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, LogOut, Boxes } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Layout() {
    const { user, logout } = useAuth();
    const nav = useNavigate();

    const linkClass = ({ isActive }) =>
        `flex items-center gap-3 px-4 h-10 text-sm border-l-2 transition-colors duration-150 ${
            isActive
                ? "bg-white/5 text-white border-[#0052FF]"
                : "text-neutral-400 hover:text-white border-transparent hover:bg-white/5"
        }`;

    return (
        <div className="min-h-screen flex bg-[#F8F9FA]">
            <aside className="w-60 shrink-0 bg-[#0A0A0A] text-white flex flex-col">
                <div className="h-16 flex items-center gap-3 px-4 border-b border-white/10">
                    <div className="w-8 h-8 bg-white text-[#0A0A0A] grid place-items-center rounded-sm">
                        <Boxes size={18} strokeWidth={2.2} />
                    </div>
                    <div>
                        <div className="font-display font-black text-sm tracking-tight leading-tight">STOKPAKET</div>
                        <div className="text-[10px] text-neutral-500 font-mono">v1.0</div>
                    </div>
                </div>

                <nav className="py-4 flex-1">
                    <div className="px-4 label-caps text-neutral-500 mb-2">Menü</div>
                    <NavLink to="/" end className={linkClass} data-testid="nav-dashboard">
                        <LayoutDashboard size={16} strokeWidth={2} />
                        Panel
                    </NavLink>
                    <NavLink to="/musteriler" className={linkClass} data-testid="nav-customers">
                        <Users size={16} strokeWidth={2} />
                        Müşteriler
                    </NavLink>
                </nav>

                <div className="p-4 border-t border-white/10">
                    <div className="text-xs text-neutral-400 mb-2 truncate">{user?.email}</div>
                    <button
                        data-testid="logout-button"
                        onClick={async () => { await logout(); nav("/login"); }}
                        className="w-full h-9 border border-white/20 hover:bg-white hover:text-[#0A0A0A] text-sm rounded-sm transition-colors duration-150 flex items-center justify-center gap-2"
                    >
                        <LogOut size={14} />
                        Çıkış
                    </button>
                </div>
            </aside>

            <main className="flex-1 min-w-0">
                <Outlet />
            </main>
        </div>
    );
}
