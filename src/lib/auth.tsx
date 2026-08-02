import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { UserType, Permissions } from "@/types";

interface AuthState {
  token: string | null;
  userType: UserType | null;
  fullName: string | null;
  userId: string | null;
  permissions: Permissions | null;
  mustChangePassword: boolean;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (credentials: { login: string; password: string }) => Promise<LoginResult>;
  logout: () => Promise<void>;
  clearMustChangePassword: () => void;
  hasPermission: (p: string) => boolean;
}

interface LoginResult {
  userType: string;
  mustChangePassword?: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    userType: null,
    fullName: null,
    userId: null,
    permissions: null,
    mustChangePassword: false,
    loading: true,
  });

  useEffect(() => {
    const token = localStorage.getItem("session_token");
    if (!token) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    api
      .me()
      .then((data) => {
        setState({
          token,
          userType: data.userType as UserType,
          fullName: data.fullName,
          userId: data.userId,
          permissions: data.permissions as Permissions,
          mustChangePassword: false,
          loading: false,
        });
      })
      .catch(() => {
        localStorage.removeItem("session_token");
        setState({ token: null, userType: null, fullName: null, userId: null, permissions: null, mustChangePassword: false, loading: false });
      });
  }, []);

  const login = async (credentials: { login: string; password: string }): Promise<LoginResult> => {
    const data = await api.login(credentials);
    localStorage.setItem("session_token", data.token);
    setState({
      token: data.token,
      userType: data.userType as UserType,
      fullName: data.fullName,
      userId: data.userId,
      permissions: data.permissions as Permissions,
      mustChangePassword: data.mustChangePassword ?? false,
      loading: false,
    });
    return { userType: data.userType, mustChangePassword: data.mustChangePassword };
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem("session_token");
    setState({ token: null, userType: null, fullName: null, userId: null, permissions: null, mustChangePassword: false, loading: false });
  };

  const clearMustChangePassword = () => {
    setState((s) => ({ ...s, mustChangePassword: false }));
  };

  const hasPermission = (p: string): boolean => {
    if (state.userType === "admin") return true;
    return state.permissions?.[p as keyof Permissions] === true;
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, clearMustChangePassword, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
