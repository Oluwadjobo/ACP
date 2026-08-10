import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { UserType, AdminRole, Permissions } from "@/types";

interface AuthState {
  token: string | null;
  userType: UserType | null;
  fullName: string | null;
  userId: string | null;
  teamId: string | null;
  teamCode: string | null;
  teamColor: string | null;
  role: AdminRole | UserType | null;
  permissions: Permissions | null;
  mustChangePassword: boolean;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (credentials: { login: string; password: string; teamCode?: string }) => Promise<LoginResult>;
  logout: () => Promise<void>;
  clearMustChangePassword: () => void;
  switchTeam: (teamId: string | null) => Promise<void>;
  hasPermission: (p: string) => boolean;
  isSuperAdmin: boolean;
}

interface LoginResult {
  userType: string;
  mustChangePassword?: boolean;
  teamId: string | null;
  teamCode: string | null;
  teamColor: string | null;
  role: string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    userType: null,
    fullName: null,
    userId: null,
    teamId: null,
    teamCode: null,
    teamColor: null,
    role: null,
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
          teamId: data.teamId ?? null,
          teamCode: (data as { teamCode?: string }).teamCode ?? null,
          teamColor: (data as { teamColor?: string }).teamColor ?? null,
          role: data.role as AdminRole | UserType,
          permissions: data.permissions as Permissions,
          mustChangePassword: false,
          loading: false,
        });
      })
      .catch(() => {
        localStorage.removeItem("session_token");
        setState({ token: null, userType: null, fullName: null, userId: null, teamId: null, teamCode: null, teamColor: null, role: null, permissions: null, mustChangePassword: false, loading: false });
      });
  }, []);

  const login = async (credentials: { login: string; password: string; teamCode?: string }): Promise<LoginResult> => {
    const data = await api.login(credentials);
    localStorage.setItem("session_token", data.token);
    setState({
      token: data.token,
      userType: data.userType as UserType,
      fullName: data.fullName,
      userId: data.userId,
      teamId: data.teamId ?? null,
      teamCode: (data as { teamCode?: string }).teamCode ?? null,
      teamColor: (data as { teamColor?: string }).teamColor ?? null,
      role: data.role as AdminRole | UserType,
      permissions: data.permissions as Permissions,
      mustChangePassword: data.mustChangePassword ?? false,
      loading: false,
    });
    return { userType: data.userType, mustChangePassword: data.mustChangePassword, teamId: data.teamId ?? null, teamCode: (data as { teamCode?: string }).teamCode ?? null, teamColor: (data as { teamColor?: string }).teamColor ?? null, role: data.role };
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem("session_token");
    setState({ token: null, userType: null, fullName: null, userId: null, teamId: null, teamCode: null, teamColor: null, role: null, permissions: null, mustChangePassword: false, loading: false });
  };

  const clearMustChangePassword = () => {
    setState((s) => ({ ...s, mustChangePassword: false }));
  };

  const switchTeam = async (teamId: string | null) => {
    try {
      await api.switchTeam(teamId);
      // Re-fetch /me to get updated teamCode/teamColor
      const me = await api.me();
      setState((s) => ({ ...s, teamId: me.teamId ?? null, teamCode: (me as { teamCode?: string }).teamCode ?? null, teamColor: (me as { teamColor?: string }).teamColor ?? null }));
    } catch {
      // ignore — team switch failed
    }
  };

  const isSuperAdmin = state.userType === "admin" && state.role === "super_admin";

  // Dynamic theming: set data-team attribute on <html> based on team code
  useEffect(() => {
    if (state.teamCode === "EAU") {
      document.documentElement.setAttribute("data-team", "EAU");
    } else {
      document.documentElement.removeAttribute("data-team");
    }
  }, [state.teamCode]);

  const hasPermission = (p: string): boolean => {
    // The super administrator holds every capability; everyone else, administrators
    // included, is limited to the permissions stored on their account (which the
    // server enforces independently).
    if (state.userType === "admin" && state.role === "super_admin") return true;
    return state.permissions?.[p as keyof Permissions] === true;
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, clearMustChangePassword, switchTeam, hasPermission, isSuperAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
