import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // null=checking, false=guest
    useEffect(() => {
        api.get("/auth/me")
            .then((r) => setUser(r.data))
            .catch(() => setUser(false));
    }, []);
    const login = async (email, password) => {
        const { data } = await api.post("/auth/login", { email, password });
        if (data.token) localStorage.setItem("token", data.token);
        setUser({ id: data.id, email: data.email, name: data.name });
        return data;
    };
    const logout = async () => {
        try { await api.post("/auth/logout"); } catch (e) {}
        localStorage.removeItem("token");
        setUser(false);
    };
    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
