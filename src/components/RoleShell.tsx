import { Link, useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { useAuth, primaryRole, rolePath, type AppRole } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface Props {
  role: AppRole;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function RoleShell({ role, title, subtitle, children }: Props) {
  const { user, roles, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.navigate({ to: "/login" });
      return;
    }
    if (!roles.includes(role) && !roles.includes("admin")) {
      const r = primaryRole(roles);
      router.navigate({ to: rolePath(r) });
    }
  }, [loading, user, roles, role, router]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-warm shadow-glow">
              <span className="font-display text-base font-bold text-primary-foreground">E</span>
            </div>
            <div className="leading-tight">
              <div className="font-display text-base font-semibold">{title}</div>
              {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user.user_metadata?.full_name ?? user.email?.split("@")[0]}</span>
            <Button variant="outline" size="sm" onClick={() => { signOut(); router.navigate({ to: "/login" }); }} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">{children}</main>
    </div>
  );
}
