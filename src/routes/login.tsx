import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole, rolePath } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — EllaCakeHub" }] }),
  component: LoginPage,
});

const USERS = [
  { name: "Amina",  label: "Day Worker",   email: "amina@ellacakehub.local",  emoji: "☀️" },
  { name: "Robert", label: "Night Worker", email: "robert@ellacakehub.local", emoji: "🌙" },
  { name: "John",   label: "Delivery",     email: "john@ellacakehub.local",   emoji: "🚐" },
  { name: "Alice",  label: "Sales",        email: "alice@ellacakehub.local",  emoji: "🛒" },
  { name: "Boss",   label: "Admin",        email: "boss@ellacakehub.local",   emoji: "👑" },
];

const PAD_KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

function LoginPage() {
  const router = useRouter();
  const { user, roles, loading: authLoading } = useAuth();
  const [selected, setSelected] = useState<typeof USERS[number] | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.navigate({ to: rolePath(primaryRole(roles)) });
    }
  }, [authLoading, user, roles, router]);

  useEffect(() => {
    if (pin.length === 4 && selected) signIn(selected.email, pin);
  }, [pin, selected]);

  async function signIn(email: string, password: string) {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Wrong PIN — try again");
      setShake(true);
      setTimeout(() => { setShake(false); setPin(""); }, 500);
    }
  }

  function handlePad(key: string) {
    if (busy || key === "") return;
    if (key === "⌫") { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length < 4) setPin((p) => p + key);
  }

  return (
    <div className="grid min-h-screen place-items-center gradient-cream px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl gradient-warm shadow-glow">
            <span className="font-display text-3xl font-bold text-primary-foreground">E</span>
          </div>
          <div className="text-center">
            <div className="font-display text-2xl font-semibold">EllaCakeHub</div>
            <div className="text-sm text-muted-foreground">Live Operations</div>
          </div>
        </div>

        {!selected ? (
          /* Step 1 — pick your name */
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="mb-4 text-center text-sm font-medium text-muted-foreground uppercase tracking-wide">Who are you?</p>
            <div className="grid gap-2">
              {USERS.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => { setSelected(u); setPin(""); }}
                  className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:bg-muted hover:border-primary/30 active:scale-[0.98]"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-xl">
                    {u.emoji}
                  </div>
                  <div>
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Step 2 — enter PIN */
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">

            {/* Selected user header */}
            <div className="mb-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setSelected(null); setPin(""); }}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted text-muted-foreground"
              >
                ←
              </button>
              <div className="flex flex-1 items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-xl">
                  {selected.emoji}
                </div>
                <div>
                  <div className="font-semibold leading-tight">{selected.name}</div>
                  <div className="text-xs text-muted-foreground">{selected.label}</div>
                </div>
              </div>
            </div>

            {/* PIN dots */}
            <div className={`mb-8 flex justify-center gap-5 transition-all ${shake ? "animate-bounce" : ""}`}>
              {[0,1,2,3].map((i) => (
                <div
                  key={i}
                  className={`h-5 w-5 rounded-full border-2 transition-all duration-150 ${
                    pin.length > i
                      ? "border-primary bg-primary scale-110"
                      : "border-muted-foreground/40 bg-transparent"
                  }`}
                />
              ))}
            </div>

            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-3">
              {PAD_KEYS.map((key, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={busy || key === ""}
                  onClick={() => handlePad(key)}
                  className={`h-16 rounded-2xl text-xl font-semibold transition active:scale-90 select-none ${
                    key === ""
                      ? "invisible"
                      : key === "⌫"
                      ? "bg-muted text-muted-foreground hover:bg-muted/70 border border-border"
                      : "bg-muted/50 hover:bg-muted border border-border"
                  } disabled:opacity-40`}
                >
                  {key}
                </button>
              ))}
            </div>

            {busy && (
              <p className="mt-5 text-center text-sm text-muted-foreground">Signing in…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
