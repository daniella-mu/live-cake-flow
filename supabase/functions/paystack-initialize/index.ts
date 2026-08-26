import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers: cors });

  const [{ data: isSales }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: user.id, _role: "sales" }),
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
  ]);
  if (!isSales && !isAdmin) return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: cors });

  const { customer_id, amount, email } = await req.json();
  if (!customer_id || !amount || Number(amount) <= 0 || !email) {
    return new Response(JSON.stringify({ error: "customer_id, amount and email are required" }), { status: 400, headers: cors });
  }

  const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      amount: Math.round(Number(amount) * 100),
      currency: "KES", // if this errors on your account, switch to "NGN" — see Paystack setup notes
      metadata: { customer_id },
    }),
  });
  const initJson = await initRes.json();
  if (!initRes.ok || !initJson.status) {
    return new Response(JSON.stringify({ error: initJson.message ?? "Paystack error" }), { status: 502, headers: cors });
  }

  return new Response(JSON.stringify({ authorization_url: initJson.data.authorization_url, reference: initJson.data.reference }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
