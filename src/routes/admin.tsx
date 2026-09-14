import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleShell } from "@/components/RoleShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fmtKES, fmtNum, elapsed } from "@/lib/format";
import { format } from "date-fns";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — EllaCakeHub" }] }),
  component: () => (
    <RoleShell role="admin" title="Admin Live" subtitle="EllaCakeHub">
      <AdminView />
    </RoleShell>
  ),
});

interface Product { id: string; name: string; cakes_per_crate: number; flour_per_mix_kg: number; crates_per_mix: number; }
interface Stock { product_id: string; location: "store"|"transit"|"market"; cakes: number; }
interface Sale { id: string; created_at: string; cakes: number; total: number; product_id: string; customer_id: string|null; sale_type: string; sales_user_id: string|null; }
interface Batch { id: string; created_at: string; mixes: number; crates_produced: number; cakes_produced: number; product_id: string; flour_used_kg: number; shift: string|null; }
interface Settings { retail_price: number; wholesale_price: number; flour_stock_kg: number; flour_per_mix_kg: number; cakes_per_crate: number; }
interface Customer { id: string; name: string; balance: number; }
interface Trip { id: string; status: string; departed_at: string|null; arrived_at: string|null; }
interface MismatchTrip { id: string; completed_at: string|null; crates_to_return: number; empty_crates_returned: number; acknowledged_at: string|null; }
interface CompletedTrip { id: string; completed_at: string|null; overnight_crates: number|null; empty_crates_returned: number|null; }
interface Profile { id: string; full_name: string; email: string|null; }
interface UserRole { user_id: string; role: "admin"|"worker"|"delivery"|"sales"; }
interface Session { id: string; user_id: string; login_at: string; logout_at: string|null; }
interface Exchange { id: string; created_at: string; customer_id: string|null; returned_product_id: string|null; replacement_product_id: string|null; quantity: number; reason: string|null; sales_user_id: string|null; }

const PRODUCT_EMOJI: Record<string, string> = {
  "Chocolate Cake": "🍫",
  "Vanilla Cake": "🍦",
  "Black Forest Cake": "🍒",
  "Red Velvet Cake": "🎂",
};

function AdminView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [mismatches, setMismatches] = useState<MismatchTrip[]>([]);
  const [completedTripsToday, setCompletedTripsToday] = useState<CompletedTrip[]>([]);
  const [completedTripsYesterday, setCompletedTripsYesterday] = useState<CompletedTrip[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    bootstrap();
    const ch = supabase.channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public" }, () => bootstrap())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function bootstrap() {
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const [p, s, sa, se, c, t, pr, ur, ws, ba, ct, cy, ex] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("stock").select("*"),
      supabase.from("sales").select("*").gte("created_at", today.toISOString()).order("created_at",{ascending:false}),
      supabase.from("settings").select("*").eq("id",1).single(),
      supabase.from("customers").select("id,name,balance").order("balance",{ascending:false}).limit(8),
      supabase.from("trips").select("id,status,departed_at,arrived_at").not("status","eq","completed").order("created_at",{ascending:false}),
      supabase.from("profiles").select("id,full_name,email"),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("work_sessions").select("*").gte("login_at", today.toISOString()).order("login_at",{ascending:false}),
      supabase.from("batches").select("*").gte("created_at", today.toISOString()),
      supabase.from("trips").select("id,completed_at,overnight_crates,empty_crates_returned").eq("status","completed").gte("completed_at", today.toISOString()),
      supabase.from("trips").select("id,completed_at,overnight_crates,empty_crates_returned").eq("status","completed").gte("completed_at", yesterday.toISOString()).lt("completed_at", today.toISOString()),
      supabase.from("exchanges").select("*").gte("created_at", today.toISOString()).order("created_at",{ascending:false}),
    ]);
    const anyError = [p,s,sa,se,c,t,pr,ur,ws,ba,ct,cy,ex].find((r) => r.error);
    if (anyError) { toast.error("Failed to load dashboard data — check your connection"); return; }
    setProducts((p.data ?? []) as Product[]);
    setStock((s.data ?? []) as Stock[]);
    setSales((sa.data ?? []) as Sale[]);
    setSettings(se.data as Settings);
    setCustomers((c.data ?? []) as Customer[]);
    setTrips((t.data ?? []) as Trip[]);
    setProfiles((pr.data ?? []) as Profile[]);
    setUserRoles((ur.data ?? []) as UserRole[]);
    setSessions((ws.data ?? []) as Session[]);
    setBatches((ba.data ?? []) as Batch[]);
    setCompletedTripsToday((ct.data ?? []) as CompletedTrip[]);
    setCompletedTripsYesterday((cy.data ?? []) as CompletedTrip[]);
    setExchanges((ex.data ?? []) as Exchange[]);
    const { data: mm } = await supabase.from("trips")
      .select("id,completed_at,crates_to_return,empty_crates_returned,acknowledged_at")
      .eq("status", "completed")
      .not("crates_to_return", "is", null)
      .not("empty_crates_returned", "is", null)
      .order("completed_at", { ascending: false });
    const allFlagged = (mm ?? []).filter((r) => r.crates_to_return != null && r.empty_crates_returned != null && r.crates_to_return !== r.empty_crates_returned);
    setMismatches(allFlagged as MismatchTrip[]);
  }

  const todayRevenue = sales.reduce((s, r) => s + Number(r.total), 0);
  const todayCakes = sales.reduce((s, r) => s + r.cakes, 0);
  const retailRevenue = sales.filter((s) => s.sale_type === "retail").reduce((sum, s) => sum + Number(s.total), 0);
  const wholesaleRevenue = sales.filter((s) => s.sale_type === "wholesale").reduce((sum, s) => sum + Number(s.total), 0);

  const stockByLoc = useMemo(() => {
    const map = { store: 0, transit: 0, market: 0 } as Record<string, number>;
    stock.forEach((r) => { map[r.location] = (map[r.location] ?? 0) + r.cakes; });
    return map;
  }, [stock]);
  const totalStockCakes = stockByLoc.store + stockByLoc.transit + stockByLoc.market;

  const hourly = useMemo(() => {
    const data: { hour: string; revenue: number; cakes: number }[] = [];
    for (let h = 0; h < 24; h++) {
      data.push({ hour: `${String(h).padStart(2,"0")}h`, revenue: 0, cakes: 0 });
    }
    sales.forEach((r) => {
      const h = new Date(r.created_at).getHours();
      data[h].revenue += Number(r.total);
      data[h].cakes += r.cakes;
    });
    const now = new Date().getHours();
    return data.slice(Math.max(0, now - 11), now + 1);
  }, [sales]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; cakes: number; revenue: number }>();
    products.forEach((p) => map.set(p.id, { name: p.name, cakes: 0, revenue: 0 }));
    sales.forEach((s) => {
      const e = map.get(s.product_id);
      if (e) { e.cakes += s.cakes; e.revenue += Number(s.total); }
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [products, sales]);

  const flourDays = useMemo((): number | null => {
    if (!settings) return null;
    const flourUsedToday = batches.reduce((s, b) => s + b.flour_used_kg, 0);
    if (flourUsedToday === 0) return null;
    const flourStockKg = settings.flour_stock_kg * 50;
    return Math.max(0, flourStockKg / flourUsedToday);
  }, [settings, batches]);

  const liveTrip = trips.find((t) => t.status === "in_transit");

  const crateStats = useMemo(() => {
    const cakesPerCrate = settings?.cakes_per_crate || 30;
    const openingWithCakes = completedTripsYesterday.reduce((s, t) => s + (t.overnight_crates ?? 0), 0);
    const openingEmpty = completedTripsYesterday.reduce((s, t) => s + (t.empty_crates_returned ?? 0), 0);
    const producedToday = batches.reduce((s, b) => s + b.crates_produced, 0);
    const totalAvailable = openingWithCakes + producedToday;
    const inStoreCrates = Math.round(stockByLoc.store / cakesPerCrate);
    const inTransitCrates = Math.round(stockByLoc.transit / cakesPerCrate);
    const atMarketCrates = Math.round(stockByLoc.market / cakesPerCrate);
    const returnedEmptyToday = completedTripsToday.reduce((s, t) => s + (t.empty_crates_returned ?? 0), 0);
    const leftStoreToday = inTransitCrates + atMarketCrates + returnedEmptyToday;
    const emptyInStore = openingEmpty + returnedEmptyToday;
    const tomorrowWithCakes = completedTripsToday.reduce((s, t) => s + (t.overnight_crates ?? 0), 0);
    const tomorrowEmpty = emptyInStore;
    return { openingWithCakes, openingEmpty, producedToday, totalAvailable, inStoreCrates, inTransitCrates, atMarketCrates, returnedEmptyToday, leftStoreToday, emptyInStore, tomorrowWithCakes, tomorrowEmpty };
  }, [completedTripsYesterday, completedTripsToday, batches, stockByLoc, settings]);

  const productStock = useMemo(() => {
    return products.map((p) => {
      const produced = batches.filter((b) => b.product_id === p.id).reduce((s, b) => s + b.cakes_produced, 0);
      const sold = sales.filter((s) => s.product_id === p.id).reduce((s, r) => s + r.cakes, 0);
      const inStore = stock.filter((s) => s.product_id === p.id && s.location === "store").reduce((s, r) => s + r.cakes, 0);
      const atMarket = stock.filter((s) => s.product_id === p.id && s.location === "market").reduce((s, r) => s + r.cakes, 0);
      const inTransit = stock.filter((s) => s.product_id === p.id && s.location === "transit").reduce((s, r) => s + r.cakes, 0);
      const value = (inStore + atMarket + inTransit) * (settings?.retail_price ?? 0);
      return { ...p, produced, sold, inStore, atMarket, inTransit, value };
    });
  }, [products, batches, sales, stock, settings]);

  const shiftStats = useMemo(() => {
    const day = batches.filter((b) => b.shift === "day");
    const night = batches.filter((b) => b.shift === "night");
    const sum = (arr: Batch[]) => ({
      mixes: arr.reduce((s, b) => s + b.mixes, 0),
      crates: arr.reduce((s, b) => s + b.crates_produced, 0),
      cakes: arr.reduce((s, b) => s + b.cakes_produced, 0),
      flour: arr.reduce((s, b) => s + b.flour_used_kg, 0),
    });
    return { day: sum(day), night: sum(night) };
  }, [batches]);

  const flourRef = useRef<HTMLInputElement>(null);
  const flourSetRef = useRef<HTMLInputElement>(null);
  async function addFlour(e: React.FormEvent) {
    e.preventDefault();
    const sacks = parseFloat(flourRef.current?.value ?? "");
    if (!sacks || sacks <= 0) return toast.error("Enter a valid amount");
    const { error } = await supabase.from("settings").update({ flour_stock_kg: (settings?.flour_stock_kg ?? 0) + sacks }).eq("id", 1);
    if (error) toast.error(error.message);
    else { toast.success(`Added ${sacks} sack${sacks !== 1 ? "s" : ""} of flour`); if (flourRef.current) flourRef.current.value = ""; bootstrap(); }
  }
  async function setFlour(e: React.FormEvent) {
    e.preventDefault();
    const sacks = parseFloat(flourSetRef.current?.value ?? "");
    if (!sacks || sacks < 0) return toast.error("Enter a valid amount");
    const { error } = await supabase.from("settings").update({ flour_stock_kg: sacks }).eq("id", 1);
    if (error) toast.error(error.message);
    else { toast.success(`Flour stock set to ${sacks} sack${sacks !== 1 ? "s" : ""}`); if (flourSetRef.current) flourSetRef.current.value = ""; bootstrap(); }
  }

  async function adjustStock(productId: string, location: "store" | "transit" | "market", cakes: number) {
    const { data: existing } = await supabase.from("stock").select("id").eq("product_id", productId).eq("location", location).single();
    const { error } = existing
      ? await supabase.from("stock").update({ cakes }).eq("id", existing.id)
      : await supabase.from("stock").insert({ product_id: productId, location, cakes });
    if (error) toast.error(error.message);
    else { toast.success("Stock adjusted"); bootstrap(); }
  }

  async function acknowledgeMismatch(id: string) {
    const { error } = await supabase.from("trips").update({ acknowledged_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else bootstrap();
  }

  async function setRole(userId: string, role: "admin"|"worker"|"delivery"|"sales") {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast.error(error.message);
    else { toast.success(`Set ${role}`); bootstrap(); }
  }

  return (
    <div className="space-y-6">
      {mismatches.filter((m) => !m.acknowledged_at).length > 0 && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 px-4 py-3 flex items-center justify-between gap-4">
          <div className="text-sm font-semibold text-destructive">
            ⚠️ {mismatches.filter((m) => !m.acknowledged_at).length} crate discrepanc{mismatches.filter((m) => !m.acknowledged_at).length > 1 ? "ies" : "y"} need attention
          </div>
          <span className="text-xs text-destructive/70 shrink-0">See Discrepancies tab →</span>
        </div>
      )}

      <Tabs defaultValue="sales">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="crates">Crates</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="mismatches">Discrepancies</TabsTrigger>
        </TabsList>

        {/* ── SALES TAB ── */}
        <TabsContent value="sales" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <BigStat label="Revenue today" value={fmtKES(todayRevenue)} accent />
            <BigStat label="Retail" value={fmtKES(retailRevenue)} />
            <BigStat label="Wholesale" value={fmtKES(wholesaleRevenue)} />
            <BigStat label="Cakes sold" value={fmtNum(todayCakes)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-xl font-semibold">Sales by hour</h3>
                <span className="text-xs text-muted-foreground">last 12 hours · live</span>
              </div>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="hour" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} formatter={(v) => fmtKES(Number(v))} />
                    <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" fill="url(#g1)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-display text-xl font-semibold">Top products</h3>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={90} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} formatter={(v) => fmtKES(Number(v))} />
                    <Bar dataKey="revenue" fill="var(--chart-1)" radius={[0,8,8,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="font-display text-xl font-semibold mb-4">Sales CRM</h3>
              <div className="max-h-72 overflow-auto pr-1 space-y-2">
                {sales.length === 0 && <p className="text-sm text-muted-foreground">No sales yet today.</p>}
                {sales.slice(0, 40).map((s) => {
                  const p = products.find((x) => x.id === s.product_id);
                  const c = customers.find((x) => x.id === s.customer_id);
                  const seller = profiles.find((x) => x.id === s.sales_user_id);
                  const time = format(new Date(s.created_at), "h:mmaaa");
                  const buyer = c?.name ?? "Walk-in";
                  const via = seller ? ` via ${seller.full_name}` : "";
                  return (
                    <div key={s.id} className="rounded-lg border border-border px-3 py-2">
                      <p className="text-sm">
                        <span className="font-medium">{buyer}</span> bought <span className="font-medium">{s.cakes} {s.cakes === 1 ? "packet" : "packets"}</span> of {PRODUCT_EMOJI[p?.name ?? ""] ?? "🎂"} {p?.name} for <span className="font-medium">{fmtKES(Number(s.total))}</span>{via} at {time}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">{s.sale_type}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-display text-xl font-semibold mb-4">Top customers</h3>
              <div className="space-y-2">
                {customers.length === 0 && <p className="text-sm text-muted-foreground">No customers yet.</p>}
                {customers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="font-display">{fmtKES(c.balance)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="font-display text-xl font-semibold mb-4">Exchanges today</h3>
            <div className="max-h-64 overflow-auto pr-1 space-y-2">
              {exchanges.length === 0 && <p className="text-sm text-muted-foreground">No exchanges today.</p>}
              {exchanges.map((x) => {
                const returned = products.find((p) => p.id === x.returned_product_id);
                const replacement = products.find((p) => p.id === x.replacement_product_id);
                const c = customers.find((p) => p.id === x.customer_id);
                const seller = profiles.find((p) => p.id === x.sales_user_id);
                const time = format(new Date(x.created_at), "h:mmaaa");
                const buyer = c?.name ?? "Walk-in";
                const via = seller ? ` via ${seller.full_name}` : "";
                return (
                  <div key={x.id} className="rounded-lg border border-border px-3 py-2">
                    <p className="text-sm">
                      <span className="font-medium">{buyer}</span> exchanged <span className="font-medium">{x.quantity} {x.quantity === 1 ? "packet" : "packets"}</span> of {PRODUCT_EMOJI[returned?.name ?? ""] ?? "🎂"} {returned?.name ?? "—"} → {PRODUCT_EMOJI[replacement?.name ?? ""] ?? "🎂"} {replacement?.name ?? "—"}{via} at {time}
                    </p>
                    {x.reason && <p className="text-xs text-muted-foreground mt-0.5">Reason: {x.reason}</p>}
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        {/* ── STOCK TAB ── */}
        <TabsContent value="stock" className="mt-6 space-y-4">
          {productStock.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">{PRODUCT_EMOJI[p.name] ?? "🎂"}</span>
                <h3 className="font-display text-xl font-semibold">{p.name}</h3>
              </div>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                <StockCell label="Produced" value={fmtNum(p.produced)} unit="cakes" />
                <StockCell label="Sold" value={fmtNum(p.sold)} unit="cakes" />
                <StockCell label="In store" value={fmtNum(p.inStore)} unit="cakes" />
                <StockCell label="At market" value={fmtNum(p.atMarket)} unit="cakes" />
                <StockCell label="In transit" value={fmtNum(p.inTransit)} unit="cakes" />
                <StockCell label="Value" value={fmtKES(p.value)} />
              </div>
            </Card>
          ))}

          <Card className="p-5">
            <h3 className="font-display text-xl font-semibold mb-4">Flour</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
              <StockCell label="Sacks remaining" value={(settings?.flour_stock_kg ?? 0).toFixed(1)} />
              <StockCell label="Days left" value={flourDays === null ? "—" : flourDays === 0 ? "Out of stock" : `${flourDays.toFixed(1)} d`} warn={flourDays !== null && flourDays < 2} />
            </div>
            {flourDays !== null && flourDays < 2 && (
              <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive font-medium">
                Low flour — restock soon
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <form onSubmit={addFlour} className="flex gap-2">
                <Input ref={flourRef} type="number" min="1" step="1" placeholder="Add sacks" className="w-36" />
                <Button type="submit">Add flour</Button>
              </form>
              <form onSubmit={setFlour} className="flex gap-2">
                <Input ref={flourSetRef} type="number" min="0" step="0.1" placeholder="Set exact sacks" className="w-36" />
                <Button type="submit" variant="outline">Set stock</Button>
              </form>
            </div>
          </Card>
        </TabsContent>

        {/* ── SHIFTS TAB ── */}
        <TabsContent value="shifts" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <ShiftCard label="☀️ Day Shift" stats={shiftStats.day} />
            <ShiftCard label="🌙 Night Shift" stats={shiftStats.night} />
          </div>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Flour remaining after today's production</div>
                <div className="mt-1 font-display text-3xl font-semibold">{(settings?.flour_stock_kg ?? 0).toFixed(1)} sack{(settings?.flour_stock_kg ?? 0) !== 1 ? "s" : ""}</div>
              </div>
              {flourDays !== null && flourDays < 2 && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive font-medium">
                  Low — restock soon
                </div>
              )}
            </div>
          </Card>
          {shiftStats.day.mixes === 0 && shiftStats.night.mixes === 0 && (
            <p className="text-sm text-muted-foreground text-center">No batches logged today yet.</p>
          )}
        </TabsContent>

        {/* ── CRATES TAB ── */}
        <TabsContent value="crates" className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Opening stock today</div>
              <div className="space-y-2">
                <CrateRow label="With cakes" value={crateStats.openingWithCakes} />
                <CrateRow label="Empty" value={crateStats.openingEmpty} />
              </div>
            </Card>
            <Card className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Produced today</div>
              <CrateRow label="New crates filled" value={crateStats.producedToday} />
            </Card>
            <Card className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Total available</div>
              <div className="font-display text-4xl font-semibold">{fmtNum(crateStats.totalAvailable)}</div>
              <div className="text-xs text-muted-foreground mt-1">opening with cakes + produced</div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Delivery activity today</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StockCell label="Left store" value={fmtNum(crateStats.leftStoreToday)} unit={crateStats.leftStoreToday === 1 ? "crate" : "crates"} />
              <StockCell label="In transit" value={fmtNum(crateStats.inTransitCrates)} unit={crateStats.inTransitCrates === 1 ? "crate" : "crates"} />
              <StockCell label="At market" value={fmtNum(crateStats.atMarketCrates)} unit={crateStats.atMarketCrates === 1 ? "crate" : "crates"} />
              <StockCell label="Returned empty" value={fmtNum(crateStats.returnedEmptyToday)} unit={crateStats.returnedEmptyToday === 1 ? "crate" : "crates"} />
            </div>
            {liveTrip && (
              <div className="mt-4 rounded-xl bg-warning/15 p-3 flex items-center gap-4">
                <Badge variant="secondary">Trip in progress</Badge>
                <div className="font-display text-2xl tabular-nums" data-tick={tick}>{elapsed(liveTrip.departed_at)}</div>
                <span className="text-xs text-muted-foreground">since departure</span>
              </div>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Store right now</div>
              <div className="space-y-2">
                <CrateRow label="Crates with cakes" value={crateStats.inStoreCrates} />
                <CrateRow label="Empty crates" value={crateStats.emptyInStore} />
              </div>
            </Card>
            <Card className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Tomorrow's opening stock</div>
              <div className="space-y-2">
                <CrateRow label="Crates with cakes (overnight)" value={crateStats.tomorrowWithCakes} />
                <CrateRow label="Empty crates" value={crateStats.tomorrowEmpty} />
              </div>
              {crateStats.tomorrowWithCakes === 0 && crateStats.tomorrowEmpty === 0 && (
                <p className="text-xs text-muted-foreground mt-2">Updates once today's trip completes.</p>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Manual adjustment</div>
            <p className="text-sm text-muted-foreground mb-4">If a physical count differs from what the system shows, enter the correct number here.</p>
            <ManualAdjustForm products={products} onAdjust={adjustStock} />
          </Card>
        </TabsContent>

        {/* ── MISMATCHES TAB ── */}
        <TabsContent value="mismatches" className="mt-6">
          <Card className="p-5">
            <h3 className="font-display text-xl font-semibold mb-4">Discrepancy log</h3>
            {mismatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No crate mismatches recorded.</p>
            ) : (
              <div className="space-y-2">
                {mismatches.map((m) => {
                  const resolved = !!m.acknowledged_at;
                  const diff = Math.abs(m.crates_to_return - m.empty_crates_returned);
                  const crate = (n: number) => `${n} crate${n !== 1 ? "s" : ""}`;
                  return (
                    <div key={m.id} className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 ${resolved ? "border-border bg-muted/30" : "border-destructive/40 bg-destructive/5"}`}>
                      <div>
                        <div className={`text-sm font-medium ${resolved ? "text-muted-foreground" : "text-destructive"}`}>
                          Trip on {m.completed_at ? new Date(m.completed_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </div>
                        <div className={`text-xs mt-0.5 ${resolved ? "text-muted-foreground" : "text-destructive/80"}`}>
                          Sales said {crate(m.crates_to_return)} · Driver returned {crate(m.empty_crates_returned)} · Diff: {crate(diff)}
                        </div>
                        {resolved && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Acknowledged {new Date(m.acknowledged_at!).toLocaleDateString("en-KE", { day: "numeric", month: "short" })} at {new Date(m.acknowledged_at!).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true })}
                          </div>
                        )}
                      </div>
                      {resolved ? (
                        <Badge variant="secondary" className="shrink-0">Resolved</Badge>
                      ) : (
                        <Button size="sm" variant="outline" className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => acknowledgeMismatch(m.id)}>
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── STAFF TAB ── */}
        <TabsContent value="staff" className="mt-6">
          <Card className="p-5">
            <h3 className="font-display text-xl font-semibold mb-4">Team today</h3>
            <div className="space-y-2">
              {profiles.map((p) => {
                const r = userRoles.find((x) => x.user_id === p.id)?.role ?? "—";
                const ws = sessions.filter((x) => x.user_id === p.id);
                const total = ws.reduce((acc, w) => acc + (new Date(w.logout_at ?? Date.now()).getTime() - new Date(w.login_at).getTime()), 0);
                const hours = (total / 3600000).toFixed(1);
                const latest = ws[0];
                const fmt = (t: string) => new Date(t).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });
                return (
                  <div key={p.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{p.full_name}</div>
                        <div className="text-xs text-muted-foreground"><span className="capitalize">{r}</span> · {hours}h today</div>
                        {latest && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            In: {fmt(latest.login_at)} · {latest.logout_at ? `Out: ${fmt(latest.logout_at)}` : "Still active"}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {(["admin","worker","delivery","sales"] as const).map((role) => (
                          <Button key={role} size="sm" variant={r===role?"default":"outline"} onClick={() => setRole(p.id, role)} className={r===role?"gradient-warm text-primary-foreground":""}>
                            {role[0].toUpperCase()}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ShiftCard({ label, stats }: { label: string; stats: { mixes: number; crates: number; cakes: number; flour: number } }) {
  return (
    <Card className="p-5">
      <h3 className="font-display text-xl font-semibold mb-4">{label}</h3>
      <div className="grid grid-cols-2 gap-3">
        <StockCell label="Mixes" value={fmtNum(stats.mixes)} />
        <StockCell label="Crates" value={fmtNum(stats.crates)} />
        <StockCell label="Cakes" value={fmtNum(stats.cakes)} />
        <StockCell label="Flour used" value={`${stats.flour.toFixed(1)} kg`} />
      </div>
    </Card>
  );
}

function StockCell({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
      <div className={`text-xs uppercase tracking-wide ${warn ? "text-destructive" : "text-muted-foreground"}`}>{label}</div>
      <div className={`mt-1 font-display text-xl font-semibold ${warn ? "text-destructive" : ""}`}>{value}</div>
      {unit && <div className="text-xs text-muted-foreground">{unit}</div>}
    </div>
  );
}

function BigStat({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <Card className={`p-5 ${accent ? "gradient-warm text-primary-foreground border-0" : warn ? "border-destructive/50 bg-destructive/5" : ""}`}>
      <div className={`text-xs uppercase tracking-wide ${accent ? "text-primary-foreground/80" : warn ? "text-destructive" : "text-muted-foreground"}`}>{label}</div>
      <div className={`mt-2 font-display text-3xl font-semibold md:text-4xl ${warn ? "text-destructive" : ""}`}>{value}</div>
    </Card>
  );
}

function CrateRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-display font-semibold">{fmtNum(value)} {value === 1 ? "crate" : "crates"}</span>
    </div>
  );
}

function ManualAdjustForm({ products, onAdjust }: { products: Product[]; onAdjust: (productId: string, location: "store" | "transit" | "market", cakes: number) => void }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [location, setLocation] = useState<"store" | "transit" | "market">("store");
  const [count, setCount] = useState("");

  useEffect(() => { if (products[0] && !productId) setProductId(products[0].id); }, [products, productId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(count);
    if (!productId || !n || n < 0) return toast.error("Enter a valid count");
    const product = products.find((p) => p.id === productId);
    onAdjust(productId, location, n * (product?.cakes_per_crate || 30));
    setCount("");
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 items-end">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Product</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Location</label>
        <select value={location} onChange={(e) => setLocation(e.target.value as "store" | "transit" | "market")} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          <option value="store">Store</option>
          <option value="market">Market</option>
          <option value="transit">Transit</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Actual crate count</label>
        <Input type="number" min="0" value={count} onChange={(e) => setCount(e.target.value)} placeholder="e.g. 12" className="w-32" />
      </div>
      <Button type="submit">Update</Button>
    </form>
  );
}

function LocBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-display text-lg">{fmtNum(value)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
