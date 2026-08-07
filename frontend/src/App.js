import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import CustomersList from "@/pages/CustomersList";
import CustomerDetail from "@/pages/CustomerDetail";

function Protected({ children }) {
    const { user } = useAuth();
    if (user === null) {
        return (
            <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
                Yükleniyor…
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    return children;
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Toaster position="top-center" richColors closeButton />
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/"
                        element={
                            <Protected>
                                <Layout />
                            </Protected>
                        }
                    >
                        <Route index element={<Dashboard />} />
                        <Route path="musteriler" element={<CustomersList />} />
                        <Route path="musteriler/:id" element={<CustomerDetail />} />
                        <Route path="musteriler/:id/:tab" element={<CustomerDetail />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
