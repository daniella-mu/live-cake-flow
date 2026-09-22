import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleShell } from "@/components/RoleShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { elapsed, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/delivery")({
  head: () => ({ meta: [{ title: "Delivery — EllaCakeHub" }] }),
  component: () => (
    <RoleShell role="delivery" title="Delivery" subtitle="Driver">
      <DeliveryView />
    </RoleShell>
  ),
});

interface Product { id: string; name: string; cakes_per_crate: number; }
interface Stock { product_id: string; location: string; cakes: number; }
type Status = "loading" | "in_transit" | "arrived" | "received" | "completed";
interface Trip {
  id: string; status: Status; created_at: string;
  departed_at: string|null; arrived_at: string|null;
  received_at: string|null; completed_at: string|null;
  broken_cakes: number|null; empty_crates_returned: number|null;
  crates_received: number|null; crates_to_return: number|null; overnight_crates: number|null;
}
interface TripItem { id: string; trip_id: string; product_id: string; crates: number; cakes: number; }

function DeliveryView() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<TripItem[]>([]);
  const [draftCrates, setDraftCrates] = useState<Record<string, number>>({});
  const [empties, setEmpties] = useState<number>(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    bootstrap();
    const ch = supabase.channel("delivery-trips")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => bootstrap())
      .on("postgres_changes", { event: "*", schema: "public", table: "stock" }, () => loadStock())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function bootstrap() {
    const [{ data: ps, error: pe }, { data: ts, error: te }] = await Promise.all([
      supabase.from("products").select("id,name,cakes_per_crate").eq("active", true).order("name"),
      supabase.from("trips").select("*").not("status","eq","completed").order("created_at",{ascending:false}).limit(1),
    ]);
    if (pe) { toast.error("Could not load products — check your connection"); return; }
    if (te) { toast.error("Could not load trip — check your connection"); return; }
    setProducts((ps ?? []) as Product[]);
    const active = (ts ?? [])[0] as Trip | undefined;
    setTrip(active ?? null);
    if (active) {
      const { data: it, error: ie } = await supabase.from("trip_items").select("*").eq("trip_id", active.id);
      if (ie) { toast.error("Could not load trip items"); return; }
      setItems((it ?? []) as TripItem[]);
    } else {
      setItems([]);
    }
    loadStock();
  }

  async function loadStock() {
    const { data, error } = await supabase.from("stock").select("product_id,location,cakes").eq("location","store");
    if (error) { toast.error("Could not load stock"); return; }
    setStock((data ?? []) as Stock[]);
  }

  function storeCakesFor(pid: string) {
    return stock.find((s) => s.product_id === pid)?.cakes ?? 0;
  }

  async function startTrip() {
    if (!user) return;
    const list = Object.entries(draftCrates).filter(([,n]) => n > 0);
    if (list.length === 0) return toast.error("Add crates first");
    const { data: t, error } = await supabase.from("trips").insert({ delivery_user_id: user.id, status: "loading" }).select().single();
    if (error || !t) return toast.error(error?.message ?? "Failed to create trip");
    const rows = list.map(([pid, crates]) => {
      const p = products.find((x) => x.id === pid)!;
      return { trip_id: t.id, product_id: pid, crates, cakes: crates * p.cakes_per_crate };
    });
    const { error: ie } = await supabase.from("trip_items").insert(rows);
    if (ie) return toast.error(ie.message);
    setDraftCrates({});
    toast.success("Trip created. Click Depart when you leave.");
    bootstrap();
  }

  async function setStatus(s: Status, extra: { empty_crates_returned?: number } = {}) {
    if (!trip) return;
    const ts = new Date().toISOString();
    const patch: { status: Status; departed_at?: string; arrived_at?: string; received_at?: string; completed_at?: string; empty_crates_returned?: number } = { status: s, ...extra };
    if (s === "in_transit") patch.departed_at = ts;
    if (s === "arrived") patch.arrived_at = ts;
    if (s === "received") patch.received_at = ts;
    if (s === "completed") patch.completed_at = ts;
    const { error } = await supabase.from("trips").update(patch).eq("id", trip.id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${s.replace("_"," ")}`);
    bootstrap();
  }

  async function completeTrip() {
    if (!trip) return;
    const salesSaid = trip.crates_to_return ?? null;
    if (salesSaid === null) return toast.error("Sales has not prepared the return yet — wait for them to log it.");
    if (empties !== salesSaid) {
      const confirmed = window.confirm(
        `⚠️ Mismatch detected!\nSales said ${salesSaid} empty crate${salesSaid !== 1 ? "s" : ""}.\nYou counted ${empties} crate${empties !== 1 ? "s" : ""}.\n\nComplete the trip anyway?`
      );
      if (!confirmed) return;
    }
    await setStatus("completed", { empty_crates_returned: empties });
  }

  const salesReadyToComplete = trip?.status === "received" && trip.crates_to_return !== null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {!trip && (
        <Card className="p-6 md:col-span-2">
          <h2 className="font-display text-2xl font-semibold">Load a new trip</h2>
          <p className="mt-1 text-sm text-muted-foreground">How many crates of each product are you taking?</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => {
              const cakesAvail = storeCakesFor(p.id);
              const cratesAvail = Math.floor(cakesAvail / p.cakes_per_crate);
              const v = draftCrates[p.id] ?? 0;
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{cratesAvail} avail</div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button variant="outline" onClick={() => setDraftCrates((d) => ({...d, [p.id]: Math.max(0, (d[p.id]??0)-1)}))}>−</Button>
                    <Input type="number" min={0} max={cratesAvail} value={v}
                      onChange={(e) => setDraftCrates((d) => ({...d, [p.id]: Math.min(cratesAvail, Math.max(0, Number(e.target.value)||0))}))}
                      className="text-center"/>
                    <Button variant="outline" onClick={() => setDraftCrates((d) => ({...d, [p.id]: Math.min(cratesAvail, (d[p.id]??0)+1)}))}>+</Button>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">= {v * p.cakes_per_crate} cakes</div>
                </div>
              );
            })}
          </div>
          <Button size="lg" onClick={startTrip} className="mt-6 w-full gradient-warm text-primary-foreground">Collect crates</Button>
        </Card>
      )}

      {trip && (
        <>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold">Active trip</h2>
              <Badge variant="secondary" className="capitalize">{trip.status.replace("_"," ")}</Badge>
            </div>
            <div className="mt-4 space-y-2">
              {items.map((it) => {
                const p = products.find((x) => x.id === it.product_id);
                return (
                  <div key={it.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <div className="font-medium">{p?.name}</div>
                    <div className="text-sm text-muted-foreground">{it.crates} crate{it.crates !== 1 ? "s" : ""} · {it.cakes} cake{it.cakes !== 1 ? "s" : ""}</div>
                  </div>
                );
              })}
            </div>

            {trip.departed_at && (
              <div className="mt-4 rounded-xl gradient-cream p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Time on the road</div>
                <div className="font-display text-3xl font-semibold tabular-nums" data-now={now}>
                  {elapsed(trip.departed_at, trip.arrived_at ?? undefined)}
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-2">
              {trip.status === "loading" && (
                <Button size="lg" className="gradient-warm text-primary-foreground" onClick={() => setStatus("in_transit")}>
                  Start delivery
                </Button>
              )}
              {trip.status === "in_transit" && (
                <Button size="lg" onClick={() => setStatus("arrived")}>Reached the marketplace</Button>
              )}
              {trip.status === "arrived" && (
                <p className="text-sm text-muted-foreground">Waiting for Sales to confirm receipt…</p>
              )}
              {trip.status === "received" && !salesReadyToComplete && (
                <p className="text-sm text-muted-foreground">Waiting for Sales to prepare the return crates…</p>
              )}
              {trip.status === "received" && salesReadyToComplete && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                    Sales is returning <span className="font-semibold">{trip.crates_to_return}</span> empty crate{trip.crates_to_return !== 1 ? "s" : ""}.
                    {trip.overnight_crates != null && (
                      <span className="block text-muted-foreground">{trip.overnight_crates} crate{trip.overnight_crates !== 1 ? "s" : ""} staying overnight at market.</span>
                    )}
                  </div>
                  <div>
                    <Label>Empty crates you physically counted</Label>
                    <Input type="number" min={0} value={empties} onChange={(e) => setEmpties(Number(e.target.value)||0)} className="mt-1" />
                  </div>
                  {empties !== (trip.crates_to_return ?? 0) && empties > 0 && (
                    <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                      ⚠️ Mismatch — Sales said {trip.crates_to_return}, you counted {empties}. Admin will be notified.
                    </div>
                  )}
                  <Button size="lg" className="w-full gradient-warm text-primary-foreground" onClick={completeTrip}>
                    Complete trip
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold">Timeline</h3>
            <ol className="mt-4 space-y-3 text-sm">
              <Step label="Crates collected" at={trip.created_at} done />
              <Step label="Departed" at={trip.departed_at} done={!!trip.departed_at} />
              <Step label="Arrived at market" at={trip.arrived_at} done={!!trip.arrived_at} />
              <Step label="Received by Sales" at={trip.received_at} done={!!trip.received_at} />
              <Step label="Completed" at={trip.completed_at} done={!!trip.completed_at} />
            </ol>
            <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Total cakes on this trip</div>
              <div className="font-display text-3xl font-semibold">{fmtNum(items.reduce((s,i)=>s+i.cakes,0))}</div>
            </div>
            {trip.crates_received != null && (
              <div className="mt-3 rounded-xl border border-border bg-muted/40 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Crates confirmed by Sales</div>
                <div className="font-display text-3xl font-semibold">{trip.crates_received}</div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Step({ label, at, done }: { label: string; at: string|null; done: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>
        {done ? "✓" : "·"}
      </span>
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{at ? new Date(at).toLocaleTimeString() : "—"}</span>
    </li>
  );
}
