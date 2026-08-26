import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "worker" | "delivery" | "sales";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  roles: [],
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => {
          fetchRoles(s.user.id);
          if (event === "SIGNED_IN") logSession(s.user.id);
        }, 0);
      } else {
        setRoles([]);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchRoles(s.user.id);
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRoles(uid: string) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
    setLoading(false);
  }

  async function logSession(uid: string) {
    // Just attempt the insert — a partial unique index on work_sessions(user_id)
    // WHERE logout_at IS NULL guarantees at most one open session per user at the
    // DB level. A conflict here just means another concurrent SIGNED_IN event
    // already created the session, which is the correct outcome, not an error.
    const { error } = await supabase.from("work_sessions").insert({ user_id: uid });
    if (error && error.code !== "23505") {
      console.error("Failed to log session:", error.message);
    }
  }

  async function signOut() {
    if (user) {
      const { data } = await supabase
        .from("work_sessions")
        .select("id")
        .eq("user_id", user.id)
        .is("logout_at", null)
        .order("login_at", { ascending: false })
        .limit(1)
        .single();
      if (data) {
        await supabase
          .from("work_sessions")
          .update({ logout_at: new Date().toISOString() })
          .eq("id", data.id);
      }
    }
    await supabase.auth.signOut();
    setRoles([]);
  }

  return (
    <Ctx.Provider value={{ user, session, roles, loading, signOut }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

export function primaryRole(roles: AppRole[]): AppRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("worker")) return "worker";
  if (roles.includes("delivery")) return "delivery";
  if (roles.includes("sales")) return "sales";
  return null;
}

export function rolePath(role: AppRole | null): string {
  switch (role) {
    case "admin": return "/admin";
    case "worker": return "/worker";
    case "delivery": return "/delivery";
    case "sales": return "/sales";
    default: return "/login";
  }
}
