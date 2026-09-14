import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleShell } from "@/components/RoleShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { fmtNum } from "@/lib/format";
import { format } from "date-fns";

export const Route = createFileRoute("/worker")({
  head: () => ({ meta: [{ title: "Worker — EllaCakeHub" }] }),
  component: () => (
    <RoleShell role="worker" title="Production" subtitle="Worker">
      <WorkerView />
    </RoleShell>
  ),
});

const PRODUCT_EMOJI: Record<string, string> = {
  "Chocolate Cake": "🍫",
  "Vanilla Cake": "🍦",
  "Black Forest Cake": "🍒",
  "Red Velvet Cake": "🎂",
};

interface Product { id: string; name: string; cakes_per_crate: number; crates_per_mix: number; flour_per_mix_kg: number; }
interface Batch { id: string; created_at: string; mixes: number; crates_produced: number; cakes_produced: number; product_id: string; note?: string; shift?: string; }

function detectShift(): "day" | "night" {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "day" : "night";
}

function WorkerView() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [mixes, setMixes] = useState<number>(1);
  const [note, setNote] = useState<string>("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [busy, setBusy] = useState(false);
  const shift = detectShift();

  useEffect(() => {
    supabase.from("products").select("*").eq("active", true).order("name").then(({ data, error }) => {
      if (error) { toast.error("Could not load products — check your connection"); return; }
      const list = (data ?? []) as Product[];
      setProducts(list);
      if (list[0]) setProductId(list[0].id);
    });

    loadBatches();
    const ch = supabase.channel("worker-batches")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "batches" }, () => loadBatches())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function loadBatches() {
    if (!user) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const { data, error } = await supabase.from("batches").select("*")
      .eq("worker_id", user.id)
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) { toast.error("Could not load batch history"); return; }
    setBatches((data ?? []) as Batch[]);
  }

  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const preview = useMemo(() => {
    if (!product) return null;
    const totalCakes = mixes * product.crates_per_mix * product.cakes_per_crate;
    const fullCrates = Math.floor(totalCakes / product.cakes_per_crate);
    const partialCakes = totalCakes % product.cakes_per_crate;
    return { crates: fullCrates, cakes: totalCakes, partialCakes };
  }, [product, mixes]);

  async function submit() {
    if (!product || !user || mixes < 1) return;
    setBusy(true);
    const crates = mixes * product.crates_per_mix;
    const cakes = crates * product.cakes_per_crate;
    const flour = mixes * product.flour_per_mix_kg;
    const { error } = await supabase.from("batches").insert({
      worker_id: user.id,
      product_id: product.id,
      mixes,
      crates_produced: crates,
      cakes_produced: cakes,
      flour_used_kg: flour,
      note: note.trim() || null,
      shift,
    });
    if (error) { setBusy(false); return toast.error(error.message); }

    setBusy(false);
    toast.success(`Logged ${mixes} mix${mixes>1?"es":""} → ${crates} crate${crates>1?"s":""}`);
    setMixes(1);
    setNote("");
  }

  const todayCakes = batches.reduce((s,b) => s + b.cakes_produced, 0);
  const todayCrates = batches.reduce((s,b) => s + b.crates_produced, 0);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">Log a batch</h2>
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">
            {shift === "day" ? "☀️ Day Shift" : "🌙 Night Shift"}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Pick a product and tell us how many mixes you made.</p>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <div className="grid grid-cols-2 gap-2">
              {products.map((p) => (
                <button key={p.id} type="button" onClick={() => setProductId(p.id)}
                  className={`rounded-xl border p-3 text-left transition ${productId === p.id ? "border-primary bg-accent/30 shadow-soft" : "border-border bg-card hover:bg-muted"}`}>
                  <div className="font-medium">{PRODUCT_EMOJI[p.name] ?? "🎂"} {p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.crates_per_mix}× crates / mix</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mixes</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="lg" onClick={() => setMixes((m) => Math.max(1, m - 1))}>−</Button>
              <Input type="number" min={1} value={mixes} onChange={(e) => setMixes(Math.max(1, Number(e.target.value)||1))} className="text-center text-2xl font-display h-14" />
              <Button type="button" variant="outline" size="lg" onClick={() => setMixes((m) => m + 1)}>+</Button>
            </div>
          </div>

          {preview && (
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Output</div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-display text-3xl font-semibold">{preview.crates}</span>
                <span className="text-sm text-muted-foreground">full crate{preview.crates !== 1 ? "s" : ""} · {preview.cakes} cake{preview.cakes !== 1 ? "s" : ""}</span>
              </div>
              {preview.partialCakes > 0 && (
                <div className="mt-2 rounded-lg border border-warning bg-warning/10 px-3 py-2 text-sm">
                  + partial crate with {preview.partialCakes} cakes
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Input placeholder='e.g. "Batch 1" or "Morning run"' value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <Button onClick={submit} disabled={busy} size="lg" className="w-full gradient-warm text-primary-foreground">
            {busy ? "Submitting…" : "Submit batch"}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">Today</h2>
          <div className="text-right">
            <div className="font-display text-3xl font-semibold">{fmtNum(todayCrates)}</div>
            <div className="text-xs text-muted-foreground">crate{todayCrates !== 1 ? "s" : ""} · {fmtNum(todayCakes)} cake{todayCakes !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {batches.length === 0 && <p className="text-sm text-muted-foreground">No batches yet today. Get baking!</p>}
          {batches.map((b) => {
            const p = products.find((x) => x.id === b.product_id);
            return (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                <div>
                  <div className="font-medium text-sm">{PRODUCT_EMOJI[p?.name ?? ""] ?? "🎂"} {p?.name ?? "Product"}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(b.created_at), "HH:mm")} · {b.mixes} mix{b.mixes > 1 ? "es" : ""}{b.note ? ` · ${b.note}` : ""}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{b.crates_produced} crate{b.crates_produced !== 1 ? "s" : ""}</div>
                  <div className="text-xs text-muted-foreground">{b.cakes_produced} cakes</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
