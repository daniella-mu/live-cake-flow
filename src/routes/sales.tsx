import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleShell } from "@/components/RoleShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtKES, fmtNum } from "@/lib/format";
import { Search } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";


export const Route = createFileRoute("/sales")({
  head: () => ({ meta: [{ title: "Sales — EllaCakeHub" }] }),
  component: () => (
    <RoleShell role="sales" title="Marketplace" subtitle="Sales">
      <SalesView />
    </RoleShell>
  ),
});

interface Product { id: string; name: string; cakes_per_crate: number; }
interface Stock { product_id: string; cakes: number; }
interface Customer { id: string; name: string; phone: string|null; balance: number; email: string|null}
interface Settings { retail_price: number; wholesale_price: number; }
interface Trip {
  id: string; status: string; arrived_at: string|null;
  crates_received: number|null; crates_to_return: number|null; overnight_crates: number|null;
}

function SalesView() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [productId, setProductId] = useState<string>("");
  const [cakes, setCakes] = useState<number>(1);
  const [type, setType] = useState<"retail"|"wholesale">("retail");
  const [arrivingTrip, setArrivingTrip] = useState<Trip | null>(null);
  const [receivedTrip, setReceivedTrip] = useState<Trip | null>(null);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [busy, setBusy] = useState(false);

  // Exchange
  const [exReturnedId, setExReturnedId] = useState("");
  const [exReplacementId, setExReplacementId] = useState("");
  const [exQty, setExQty] = useState(1);
  const [exReason, setExReason] = useState<"wrong_type"|"damaged">("wrong_type");
  const [exBusy, setExBusy] = useState(false);

  // Step 4 — receipt confirmation
  const [cratesReceived, setCratesReceived] = useState(0);
  const [brokenCakes, setBrokenCakes] = useState(0);

  // Step 5 — return preparation
  const [cratesToReturn, setCratesToReturn] = useState(0);
  const [overnightCrates, setOvernightCrates] = useState(0);

  useEffect(() => {
    bootstrap();
    const ch = supabase.channel("sales-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock" }, loadStock)
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, loadTrips)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sales" }, loadRevenue)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => loadCustomers(search))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function bootstrap() {
    const [{ data: ps, error: pe }, { data: st, error: se }] = await Promise.all([
      supabase.from("products").select("id,name,cakes_per_crate").eq("active",true).order("name"),
      supabase.from("settings").select("retail_price,wholesale_price").eq("id",1).single(),
    ]);
    if (pe) { toast.error("Could not load products — check your connection"); return; }
    if (se) { toast.error("Could not load settings — check your connection"); return; }
    const list = (ps ?? []) as Product[];
    setProducts(list);
    if (list[0]) { setProductId(list[0].id); setExReturnedId(list[0].id); setExReplacementId(list[1]?.id ?? list[0].id); }
    setSettings(st as Settings);
    loadStock(); loadCustomers(""); loadTrips(); loadRevenue();
  }

  async function loadStock() {
    const { data, error } = await supabase.from("stock").select("product_id,cakes").eq("location","market");
    if (error) { toast.error("Could not load stock"); return; }
    setStock((data ?? []) as Stock[]);
  }

  async function loadCustomers(q: string) {
    const query = supabase.from("customers").select("*").order("name").limit(20);
    if (q) query.ilike("name", `%${q}%`);
    const { data, error } = await query;
    if (error) { toast.error("Could not load customers"); return; }
    setCustomers((data ?? []) as Customer[]);
  }

  async function loadTrips() {
    const { data, error } = await supabase.from("trips")
      .select("id,status,arrived_at,crates_received,crates_to_return,overnight_crates")
      .in("status", ["arrived", "received"])
      .order("arrived_at", { ascending: false })
      .limit(1);
    if (error) { toast.error("Could not load delivery status"); return; }
    const active = (data ?? [])[0] as Trip | undefined ?? null;
    if (active?.status === "arrived") { setArrivingTrip(active); setReceivedTrip(null); }
    else if (active?.status === "received") { setReceivedTrip(active); setArrivingTrip(null); }
    else { setArrivingTrip(null); setReceivedTrip(null); }
  }

  async function loadRevenue() {
    const today = new Date(); today.setHours(0,0,0,0);
    const { data, error } = await supabase.from("sales").select("total").gte("created_at", today.toISOString());
    if (error) { toast.error("Could not load revenue"); return; }
    setTodayRevenue((data ?? []).reduce((s, r) => s + Number(r.total), 0));
  }

  useEffect(() => { loadCustomers(search); }, [search]);

  useEffect(() => {
    if (!selectedCustomer) return;
    const fresh = customers.find((c) => c.id === selectedCustomer.id);
    if (fresh && fresh.balance !== selectedCustomer.balance) setSelectedCustomer(fresh);
  }, [customers]);

  function stockFor(pid: string) { return stock.find((s) => s.product_id === pid)?.cakes ?? 0; }
  const stockValue = useMemo(() => {
    if (!settings) return 0;
    return stock.reduce((s, r) => s + r.cakes * settings.retail_price, 0);
  }, [stock, settings]);

  const unitPrice = settings ? (type === "retail" ? settings.retail_price : settings.wholesale_price) : 0;
  const total = unitPrice * cakes;

  async function recordSale() {
    if (!user || !settings || !productId || cakes < 1) return;
    if (!selectedCustomer) return toast.error("Select a customer first — they must have a topped-up balance");
    if (cakes > stockFor(productId)) return toast.error("Not enough stock at market");
    if (selectedCustomer.balance < total)
      return toast.error(`Insufficient balance — customer needs to send ${fmtKES(total - selectedCustomer.balance)} more`);
    setBusy(true);
    const { error } = await supabase.from("sales").insert({
      sales_user_id: user.id,
      customer_id: selectedCustomer.id,
      product_id: productId,
      cakes,
      unit_price: unitPrice,
      total,
      sale_type: type,
      paid_from_balance: true,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Sale recorded · ${fmtKES(total)}`);
    setCakes(1);
    loadCustomers(search);
  }

  // Step 4 — sales confirms receipt
  async function confirmReceipt() {
    if (!arrivingTrip) return;
    if (cratesReceived < 1) return toast.error("Enter how many crates you received");
    const { error } = await supabase.from("trips").update({
      status: "received",
      received_at: new Date().toISOString(),
      crates_received: cratesReceived,
      broken_cakes: brokenCakes || null,
    }).eq("id", arrivingTrip.id);
    if (error) return toast.error(error.message);
    toast.success("Receipt confirmed — stock moved to market");
    setCratesReceived(0);
    setBrokenCakes(0);
  }

  // Step 5 — sales prepares return
  async function prepareReturn() {
    if (!receivedTrip) return;
    if (cratesToReturn < 0) return toast.error("Enter a valid number of crates");
    const { error } = await supabase.from("trips").update({
      crates_to_return: cratesToReturn,
      overnight_crates: overnightCrates || null,
    }).eq("id", receivedTrip.id);
    if (error) return toast.error(error.message);
    toast.success("Return logged — waiting for driver to confirm");
    setCratesToReturn(0);
    setOvernightCrates(0);
  }

  async function logExchange() {
    if (!user || !selectedCustomer) return toast.error("Select a customer first");
    if (!exReturnedId || !exReplacementId) return toast.error("Select both products");
    if (exReturnedId === exReplacementId) return toast.error("Returned and replacement must be different products");
    if (exQty < 1) return toast.error("Quantity must be at least 1");
    if (stockFor(exReplacementId) < exQty) return toast.error("Not enough replacement stock at market");
    setExBusy(true);

    const { error } = await supabase.from("exchanges").insert({
      customer_id: selectedCustomer.id,
      returned_product_id: exReturnedId,
      replacement_product_id: exReplacementId,
      quantity: exQty,
      reason: exReason,
      sales_user_id: user.id,
    });
    if (error) { setExBusy(false); return toast.error(error.message); }

    // Add returned cakes back to market stock
    const returnedStock = stock.find((s) => s.product_id === exReturnedId);
    const returnErr = returnedStock
      ? (await supabase.from("stock").update({ cakes: returnedStock.cakes + exQty }).eq("product_id", exReturnedId).eq("location", "market")).error
      : (await supabase.from("stock").insert({ product_id: exReturnedId, location: "market", cakes: exQty })).error;
    if (returnErr) { setExBusy(false); return toast.error("Failed to update returned stock"); }

    // Deduct replacement cakes from market stock
    const replacementStock = stock.find((s) => s.product_id === exReplacementId);
    if (replacementStock) {
      const { error: replErr } = await supabase.from("stock").update({ cakes: replacementStock.cakes - exQty }).eq("product_id", exReplacementId).eq("location", "market");
      if (replErr) { setExBusy(false); return toast.error("Failed to update replacement stock"); }
    }

    setExBusy(false);
    toast.success("Exchange logged");
    setExQty(1);
    loadStock();
  }

  async function addCustomer() {
    const name = prompt("Customer name?");
    if (!name) return;
    const phone = prompt("Phone (optional)") || null;
    const { error } = await supabase.from("customers").insert({ name, phone });
    if (error) return toast.error(error.message);
    toast.success("Customer added");
  }

  const [topUpAmount, setTopUpAmount] = useState<number>(0);
  const [topUpEmail, setTopUpEmail] = useState("");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [topUpStartBalance, setTopUpStartBalance] = useState(0);


  useEffect(() => {
    setTopUpEmail(selectedCustomer?.email ?? "");
    setTopUpAmount(0);
  }, [selectedCustomer?.id]);

  async function topUp() {
    if (!selectedCustomer) return;
    if (!topUpEmail) return toast.error("Enter an email for the top-up receipt");
    if (topUpAmount < 1) return toast.error("Enter a valid amount");
    setTopUpBusy(true);
    const { data, error } = await supabase.functions.invoke("paystack-initialize", {
      body: { customer_id: selectedCustomer.id, amount: topUpAmount, email: topUpEmail },
    });
    setTopUpBusy(false);
    if (error) return toast.error(error.message);
    setTopUpStartBalance(selectedCustomer.balance);
    setCheckoutUrl(data.authorization_url);
  }

  useEffect(() => {
    if (!checkoutUrl || !selectedCustomer) return;
    if (selectedCustomer.balance > topUpStartBalance) {
      setCheckoutUrl(null);
      toast.success(`Payment received — new balance ${fmtKES(selectedCustomer.balance)}`);
    }
  }, [selectedCustomer?.balance]);

  return (
    <>
      <Dialog open={!!checkoutUrl} onOpenChange={(open) => !open && setCheckoutUrl(null)}>
       <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan to pay</DialogTitle>
          <DialogDescription>
            Have the customer scan this with their own phone to complete checkout on their own device. Balance updates automatically once paid.
          </DialogDescription>
        </DialogHeader>
        {checkoutUrl && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="rounded-lg bg-white p-4">
              <QRCodeSVG value={checkoutUrl} size={200} />
            </div>
            <Button type="button" variant="outline" onClick={() => window.open(checkoutUrl, "_blank")}>
              Open here instead
            </Button>
          </div>
        )}
       </DialogContent>
      </Dialog>

    <div className="grid gap-6 lg:grid-cols-3">

      {/* Step 4 — Delivery arrived, sales confirms receipt */}
      {arrivingTrip && (
        <Card className="lg:col-span-3 p-5 border-warning bg-warning/10">
          <Badge variant="secondary">Delivery arrived</Badge>
          <p className="mt-1 font-medium mb-4">Count the crates and confirm receipt.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Crates received</Label>
              <Input type="number" min={0} value={cratesReceived} onChange={(e) => setCratesReceived(Number(e.target.value)||0)} className="mt-1" />
            </div>
            <div>
              <Label>Broken cakes (if any)</Label>
              <Input type="number" min={0} value={brokenCakes} onChange={(e) => setBrokenCakes(Number(e.target.value)||0)} className="mt-1" />
            </div>
            <div className="flex items-end">
              <Button onClick={confirmReceipt} className="w-full gradient-warm text-primary-foreground">Confirm receipt</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 5 — Sales prepares return */}
      {receivedTrip && receivedTrip.crates_to_return === null && (
        <Card className="lg:col-span-3 p-5 border-border bg-muted/30">
          <Badge variant="outline">Prepare return</Badge>
          <p className="mt-1 font-medium mb-4">End of day — log how many crates are going back and how many are staying overnight.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Empty crates to return</Label>
              <Input type="number" min={0} value={cratesToReturn} onChange={(e) => setCratesToReturn(Number(e.target.value)||0)} className="mt-1" />
            </div>
            <div>
              <Label>Crates with cakes (staying overnight)</Label>
              <Input type="number" min={0} value={overnightCrates} onChange={(e) => setOvernightCrates(Number(e.target.value)||0)} className="mt-1" />
            </div>
            <div className="flex items-end">
              <Button onClick={prepareReturn} className="w-full gradient-warm text-primary-foreground">Log return</Button>
            </div>
          </div>
        </Card>
      )}

      {receivedTrip && receivedTrip.crates_to_return !== null && (
        <Card className="lg:col-span-3 p-5 border-border bg-muted/30">
          <Badge variant="outline">Waiting for driver</Badge>
          <p className="mt-1 text-sm text-muted-foreground">
            Return logged: <span className="font-medium">{receivedTrip.crates_to_return} empty crate{receivedTrip.crates_to_return !== 1 ? "s" : ""}</span>
            {receivedTrip.overnight_crates != null && ` · ${receivedTrip.overnight_crates} crate${receivedTrip.overnight_crates !== 1 ? "s" : ""} staying overnight`}.
            Waiting for the driver to confirm pickup.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:col-span-3 lg:grid-cols-3">
        <Stat label="Today's revenue" value={fmtKES(todayRevenue)} />
        <Stat label="Stock value" value={fmtKES(stockValue)} />
        <Stat label="Cakes at market" value={fmtNum(stock.reduce((s,r)=>s+r.cakes,0))} />
      </div>

      <Card className="p-6 lg:col-span-2">
        <h2 className="font-display text-2xl font-semibold">New sale</h2>
        <div className="mt-5 space-y-5">
          <div>
            <Label>Customer</Label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {customers.map((c) => (
                <button key={c.id} type="button" onClick={() => setSelectedCustomer(c)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${selectedCustomer?.id === c.id ? "border-primary bg-accent/40" : "border-border bg-card hover:bg-muted"}`}>
                  {c.name} <span className="ml-1 text-xs text-muted-foreground">{fmtKES(c.balance)}</span>
                </button>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={addCustomer}>+ New</Button>
            </div>
            {selectedCustomer && (
              <div className="mt-3 rounded-xl border border-border bg-card p-3 space-y-2">
                <Label className="text-xs">Top up {selectedCustomer.name} (Paystack test)</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input type="number" min={1} placeholder="Amount" value={topUpAmount || ""} onChange={(e) => setTopUpAmount(Number(e.target.value) || 0)} />
                  <Input type="email" placeholder="Email" value={topUpEmail} onChange={(e) => setTopUpEmail(e.target.value)} />
                  <Button type="button" variant="outline" disabled={topUpBusy} onClick={topUp}>{topUpBusy ? "Opening…" : "Top up"}</Button>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>Product</Label>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {products.map((p) => {
                const avail = stockFor(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => setProductId(p.id)}
                    className={`rounded-xl border p-3 text-left transition ${productId === p.id ? "border-primary bg-accent/30" : "border-border bg-card hover:bg-muted"}`}>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{avail} cake{avail !== 1 ? "s" : ""} left</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Quantity (cakes)</Label>
              <div className="mt-1 flex items-center gap-2">
                <Button variant="outline" onClick={() => setCakes((c) => Math.max(1, c-1))}>−</Button>
                <Input type="number" min={1} value={cakes} onChange={(e) => setCakes(Math.max(1, Number(e.target.value)||1))} className="text-center text-xl font-display h-12" />
                <Button variant="outline" onClick={() => setCakes((c) => c+1)}>+</Button>
              </div>
            </div>
            <div>
              <Label>Type</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setType("retail")}
                  className={`rounded-xl border p-3 text-left ${type==="retail"?"border-primary bg-accent/30":"border-border"}`}>
                  <div className="font-medium">Retail</div>
                  <div className="text-xs text-muted-foreground">{fmtKES(settings?.retail_price ?? 0)}/cake</div>
                </button>
                <button type="button" onClick={() => setType("wholesale")}
                  className={`rounded-xl border p-3 text-left ${type==="wholesale"?"border-primary bg-accent/30":"border-border"}`}>
                  <div className="font-medium">Wholesale</div>
                  <div className="text-xs text-muted-foreground">{fmtKES(settings?.wholesale_price ?? 0)}/cake</div>
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl gradient-cream p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-display text-3xl font-semibold">{fmtKES(total)}</span>
            </div>
            {selectedCustomer && (
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Customer balance</span>
                <span className="font-medium">{fmtKES(selectedCustomer.balance)}</span>
              </div>
            )}
            {selectedCustomer && selectedCustomer.balance < total && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                Short by {fmtKES(total - selectedCustomer.balance)} — customer needs to send more
              </div>
            )}
          </div>

          <Button size="lg" disabled={busy || !selectedCustomer || (selectedCustomer.balance < total)} onClick={recordSale} className="w-full gradient-warm text-primary-foreground disabled:opacity-50">
            {busy ? "Recording…" : "Record sale"}
          </Button>
        </div>
      </Card>

      <Card className="p-6 lg:col-span-2">
        <h2 className="font-display text-2xl font-semibold">Customer Exchange</h2>
        <p className="mt-1 text-sm text-muted-foreground">Customer returns a cake and gets a replacement.</p>
        {!selectedCustomer && <p className="mt-3 text-sm text-destructive">Select a customer above first.</p>}
        {selectedCustomer && (
          <div className="mt-5 space-y-4">
            <div>
              <Label>Product returned by customer</Label>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {products.map((p) => (
                  <button key={p.id} type="button" onClick={() => setExReturnedId(p.id)}
                    className={`rounded-xl border p-3 text-left transition ${exReturnedId === p.id ? "border-primary bg-accent/30" : "border-border bg-card hover:bg-muted"}`}>
                    <div className="font-medium">{p.name}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Replacement product to give</Label>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {products.map((p) => (
                  <button key={p.id} type="button" onClick={() => setExReplacementId(p.id)}
                    className={`rounded-xl border p-3 text-left transition ${exReplacementId === p.id ? "border-primary bg-accent/30" : "border-border bg-card hover:bg-muted"}`}>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{stockFor(p.id)} left</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Quantity (cakes)</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Button variant="outline" onClick={() => setExQty((q) => Math.max(1, q-1))}>−</Button>
                  <Input type="number" min={1} value={exQty} onChange={(e) => setExQty(Math.max(1, Number(e.target.value)||1))} className="text-center text-xl font-display h-12" />
                  <Button variant="outline" onClick={() => setExQty((q) => q+1)}>+</Button>
                </div>
              </div>
              <div>
                <Label>Reason</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setExReason("wrong_type")}
                    className={`rounded-xl border p-3 text-left ${exReason==="wrong_type"?"border-primary bg-accent/30":"border-border"}`}>
                    <div className="font-medium text-sm">Wrong type</div>
                  </button>
                  <button type="button" onClick={() => setExReason("damaged")}
                    className={`rounded-xl border p-3 text-left ${exReason==="damaged"?"border-primary bg-accent/30":"border-border"}`}>
                    <div className="font-medium text-sm">Damaged</div>
                  </button>
                </div>
              </div>
            </div>
            <Button size="lg" disabled={exBusy || !exReturnedId || !exReplacementId} onClick={logExchange} className="w-full gradient-warm text-primary-foreground disabled:opacity-50">
              {exBusy ? "Logging…" : "Log exchange"}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-display text-xl font-semibold">Live stock</h3>
        <div className="mt-4 space-y-2">
          {products.map((p) => {
            const c = stockFor(p.id);
            const value = c * (settings?.retail_price ?? 0);
            const crates = Math.floor(c / p.cakes_per_crate);
            return (
              <div key={p.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-baseline justify-between">
                  <div className="font-medium">{p.name}</div>
                  <div className="font-display text-2xl">{fmtNum(c)}</div>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{crates} crate{crates !== 1 ? "s" : ""}</span>
                  <span>{fmtKES(value)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </Card>
  );
}
