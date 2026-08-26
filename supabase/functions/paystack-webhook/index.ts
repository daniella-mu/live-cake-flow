import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;

async function hmacSha512Hex(key: string, message: string) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Hash the RAW body — a re-serialized JSON object can produce a different
  // string (key order, whitespace) and false-negative real webhooks.
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  if (signature !== await hmacSha512Hex(PAYSTACK_SECRET_KEY, rawBody)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event !== "charge.success") {
    return new Response(JSON.stringify({ ok: true, ignored: event.event }), { headers: { "Content-Type": "application/json" } });
  }

  const { reference, amount, metadata } = event.data;
  const customerId = metadata?.customer_id ?? null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Idempotency: Paystack can retry webhook delivery — don't double-credit.
  const { data: existing } = await supabase.from("payments").select("id").eq("paystack_reference", reference).maybeSingle();
  if (existing) return new Response(JSON.stringify({ ok: true, alreadyProcessed: true }), { headers: { "Content-Type": "application/json" } });

  // apply_payment trigger fires on insert and credits customers.balance — no extra logic needed here.
  const { error } = await supabase.from("payments").insert({
    customer_id: customerId,
    amount: amount / 100,
    reference,
    paystack_reference: reference,
    source: "paystack",
  });

  if (error) {
    if (error.code === "23505") return new Response(JSON.stringify({ ok: true, alreadyProcessed: true }), { headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
