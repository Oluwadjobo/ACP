import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { UserType } from "@/types";

interface AuthState {
  token: string | null;
  userType: UserType | null;
  fullName: string | null;
  userId: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (credentials: { login: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    userType: null,
    fullName: null,
    userId: null,
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
          loading: false,
        });
      })
      .catch(() => {
        localStorage.removeItem("session_token");
        setState({ token: null, userType: null, fullName: null, userId: null, loading: false });
      });
  }, []);

  const login = async (credentials: { login: string; password: string }) => {
    const data = await api.login(credentials);
    localStorage.setItem("session_token", data.token);
    setState({
      token: data.token,
      userType: data.userType as UserType,
      fullName: data.fullName,
      userId: data.userId,
      loading: false,
    });
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem("session_token");
    setState({ token: null, userType: null, fullName: null, userId: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
