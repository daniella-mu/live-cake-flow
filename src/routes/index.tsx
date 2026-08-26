import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, primaryRole, rolePath } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EllaCakeHub — Live Operations" },
      { name: "description", content: "Real-time bakery management for EllaCakeHub." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, roles, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      const r = primaryRole(roles);
      if (r) router.navigate({ to: rolePath(r) });
    }
  }, [loading, user, roles, router]);

  return (
    <div className="min-h-screen gradient-cream">
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl gradient-warm shadow-glow">
            <span className="font-display text-xl font-bold text-primary-foreground">E</span>
          </div>
          <div>
            <div className="font-display text-lg font-semibold leading-none">EllaCakeHub</div>
            <div className="text-xs text-muted-foreground">Bakery Live</div>
          </div>
        </div>
        <Link to="/login">
          <Button variant="outline">Sign in</Button>
        </Link>
      </header>

      <main className="container mx-auto px-6 pt-12 pb-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            Live operations dashboard
          </div>
          <h1 className="font-display text-5xl font-semibold tracking-tight md:text-7xl">
            Your bakery,<br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">in real time.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            From the first mix to the last sale — every batch, crate, trip, and shilling, on every phone, the moment it happens.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/login">
              <Button size="lg" className="gradient-warm text-primary-foreground shadow-glow">Open dashboard</Button>
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-4">
          {[
            { t: "Worker", d: "Logs mixes. Stock updates instantly." },
            { t: "Delivery", d: "Departs, arrives, returns empties." },
            { t: "Sales", d: "Mpesa-aware checkout + live stock." },
            { t: "Admin", d: "Sees everything, from anywhere." },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="font-display text-lg font-semibold">{x.t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{x.d}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
