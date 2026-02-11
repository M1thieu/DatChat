import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { Login } from "@/components/auth/Login";
import { Register } from "@/components/auth/Register";
import { AppLayout } from "@/components/layout/AppLayout";
import { ToastContainer } from "@/components/ui/Toast";

export default function App() {
  const { session, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-bg-active border-t-accent" />
          <div className="text-text-muted text-sm">Loading DatChat...</div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={session ? <Navigate to="/" replace /> : <Register />}
        />
        <Route
          path="/*"
          element={session ? <AppLayout /> : <Navigate to="/login" replace />}
        />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}
