import React, { createContext, useContext } from "react";
import { useAdminAuth, AdminUser } from "@/hooks/useAdminAuth";

interface AdminAuthContextValue {
  adminToken: string | null;
  adminUser: AdminUser | null;
  isAdminAuthenticated: boolean;
  isAdminLoading: boolean;
  adminLogin: (email: string, password: string) => Promise<void>;
  adminLogout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAdminAuth();
  return <AdminAuthContext.Provider value={auth}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuthContext() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuthContext must be used within AdminAuthProvider");
  return ctx;
}
