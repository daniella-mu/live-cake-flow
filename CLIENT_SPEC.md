# EllaCakeHub — Project Spec

## Project Vision

A real-time bakery management system. The owner can sit anywhere in the world, open his phone, and know exactly what is happening in his bakery at that exact moment — who made what, how many cakes exist, where they are, what has been sold, how much money has come in, and who is working.

Everything is connected in real time. When the worker logs 6 mixes, the admin sees it immediately. When the delivery guy departs, the admin sees the timer running. When a sale happens, the revenue number updates on the admin's screen instantly. Every phone is looking at the same live data.

### Tech Stack
- **React** — runs in any phone browser, no download needed
- **Supabase** — database, realtime broadcasts, auth
- **Cloudflare Workers** — hosting at `live-cake-flow.daniellamutai97.workers.dev` (switched from Vercel — the app uses TanStack Start with SSR, which builds to Cloudflare Workers format via `wrangler.jsonc`; Vercel expected a plain Vite `dist/` output and returned 404. Cloudflare is the correct target for this stack. Custom domain to be added before client handoff.)
- **M-Pesa-style balance top-up** — customers pre-fund a balance which sales staff draw down across purchases; currently confirmed via an SMS-forwarding webhook, with a move to a proper Paystack test-mode integration planned (see Pending below)

---

## Users
5 roles total, each with their own PIN:
- Worker 1 — Day Shift
- Worker 2 — Night Shift
- Delivery Guy
- Sales Guy
- Admin / Owner

*(Names and PINs are set up per deployment — configure via the Admin → Staff tab.)*

---

## Products

| Product | Flour per mix | Mixes per basin | Crates per basin | Cakes per crate |
|---|---|---|---|---|
| 🍫 Chocolate Cake | 5kg | 3 | 3 | 30 |
| 🍦 Vanilla Cake | 6kg | 3 | 3 | 30 |
| 🍒 Black Forest Cake | 6kg | 1 (1 mix = 1 basin directly) | 3 | 30 |
| 🎂 Red Velvet Cake | 7kg | 3 | 3 | 30 |

Product list, formula, and pricing are fully configurable via the `products` and `settings` tables — the four above are just the current demo catalog.

---

## The Delivery Guy

### Steps
1. **Collecting Crates** — enters number of crates, taps "Crates Collected". Admin sees crates picked up.
2. **Departing** — taps "Start Delivery". Timer starts. Admin sees he is on the road.
3. **Arriving** — taps "Reached the Marketplace". Sales guy gets a notification on his screen.
4. **Sales Confirms Receipt** — sales guy counts crates, enters number received + any broken cakes. Official handover record created.
5. **Sales Prepares Return** — sales guy enters how many empty crates to send back + how many crates with unsold cakes are staying overnight (these carry forward to tomorrow's opening stock automatically).
6. **Delivery Confirms** — delivery guy counts empty crates physically and confirms. If number doesn't match what sales said, system flags it. Trip complete.

### Broken cakes
Delivery guy can log broken cakes found at market separately as "returned to store" at any time. Sales guy still sells them — tracked in return logs.

### What admin sees
Every step with timestamps: crates left store, trip duration, crates arrived, crates returned, crates still at market with cakes, unsold cakes count. No phone calls needed.

### Key rule
Neither delivery nor sales can complete their side without the other confirming. Nothing can be faked or skipped.

---

## The Sales Guy

### Stock Screen
Live dashboard showing every product: produced today, sold, remaining, at marketplace vs store, remaining value in KES. Updates in real time.

### Making a Sale
1. Search customer name in the balance search box
2. System looks them up — if they haven't paid, nothing shows, sale is blocked
3. Select Retail (KES 60/packet) or Wholesale (KES 45/packet)
4. Pick products and quantities — system builds cart and shows total
5. If total > customer balance, sale is blocked and shows exact shortfall
6. If customer sends more money it adds to their balance and sale goes through

### No Duplicate Orders
Same customer buying again that day — system recognises them, adds to existing record, shows updated remaining balance.

### Customer Exchange
Customer returns a cake (wrong type / damaged) — sales guy logs as exchange. Customer gets replacement. Recorded in return log.

### Confirming Delivery
Sales guy gets alert when delivery arrives. Counts crates, enters number received + broken cakes. Later logs empty crates to return + overnight crates.

### What admin sees from sales
Every sale: buyer name, product, quantity, retail/wholesale, amount, sales person, time. Live bar graph of sales per hour. Total revenue, retail vs wholesale split, best-performing product.

---

## The Worker

### What she does
Log mixes made. That is all.

### Login
Opens app, enters name and PIN. System auto-detects Day or Night shift based on time — she does not choose.

### Logging Mixes
1. Select product
2. Enter number of mixes
3. System calculates full crates + partial crates (with exact cake count)
4. Optional note (e.g. "Batch 1", "Morning run")
5. Tap Submit

### Her History Tab
Her own entries for the day only — product, time, crates out. Nothing else.

### What she never sees
Flour stock, sales figures, delivery status, other workers' production, revenue, crate tracking, staff login times.

### What happens silently on submit
- Flour deducted from stock, at the rate configured per product
- New crates added to store inventory (delivery guy sees them available)
- Admin dashboard updates in real time
- Shift recorded (Day vs Night) for admin comparison

---

## The Admin

Sees everything from anywhere in real time. Never needs to be at the bakery.

### Sales Tab
- Total revenue today + all-time
- Retail revenue vs wholesale revenue separately
- Bar graph: sales per hour throughout the day
- Product performance chart (best seller)
- Full CRM feed — every sale as a message e.g. *"Amina Yusuf bought 10 packets of Vanilla Cake for KES 600 via Zawadi at 2:30PM"*

### Stock Tab
Per product: produced today, sold, remaining, at marketplace, in store, remaining value, amount earned.
Flour section: sacks remaining, mixes that translates to, days of flour left based on today's usage rate, big red warning if running low.
Actions: add flour stock, add payment records manually.

### Shifts Tab
Side-by-side Day Shift vs Night Shift: products made, mixes, cakes, flour used. Remaining flour after today's production. Identifies if one shift is underperforming.

### Crates Tab
Full crate picture:
- Opening stock (yesterday's overnight crates with cakes + empty crates in store)
- Produced today (new crates filled)
- Total available
- Delivery activity: went out, came back empty, in transit, at marketplace with cakes
- Store right now: crates with cakes not yet delivered, empty crates in store
- Projection for tomorrow: opening stock if nothing more happens today
- Manual adjustment for counting errors

### Staff Tab
Every staff member who logged in today: name, role, shift, login time, logout time, hours on shift. Identifies late arrivals, early departures, still-active sessions. Workers never see this tab.

### Admin-only actions
- Adjust crate inventory numbers
- Add flour stock
- Add payment records
- See all staff login times
- See full sales CRM
- See flour consumption rates and projections

### The big picture questions the admin can answer instantly
- How many cakes made today and by which shift?
- How many cakes at marketplace right now?
- How much money came in today?
- Which product is selling most?
- Is flour running low?
- Where is the delivery guy right now?
- Who is working and for how long?
- Did a given customer buy anything today and how much did they pay?

---

## Build Status

### Done ✅
- Delivery trip workflow (Steps 1–6 with handshake)
- Mismatch detection (warning shown, data saved to DB)
- Sales page: receipt confirmation (Step 4), return preparation (Step 5)
- Worker batch logging with note field
- Products: Chocolate Cake, Vanilla Cake, Black Forest Cake, Red Velvet Cake
- Admin: flour stock top-up, low flour warning
- Realtime updates across all pages
- Login/logout session tracking
- ✅ PIN-based login — name cards + PIN pad, no email visible
- ✅ Shift auto-detection — Day (6am–6pm) / Night (6pm–6am), saved with each batch, shown as badge on worker page
- ✅ Worker partial crate display — shows partial crate banner with cake count when a batch has leftover cakes
- ✅ Worker flour visibility removed — flour levels not shown on worker page
- ✅ Sales flow — sale blocked if no customer selected or balance insufficient, exact shortfall shown
- ✅ Mismatch flagging on admin dashboard — red banner shows flagged trips with date and exact crate difference
- ✅ Admin layout reorganised — Sales, Stock, Shifts, Crates, Staff tabs. Retail/wholesale split on Sales tab. Per-product stock table on Stock tab. Day vs Night comparison on Shifts tab.
- ✅ Crates tab — opening stock, produced today, total available, delivery activity, store right now, tomorrow's projection, manual adjustment form.
- ✅ Discrepancies tab — full log of crate discrepancies, red for unresolved, grey for acknowledged. Compact banner points to tab.
- ✅ Deployed to Cloudflare Workers — live at `live-cake-flow.daniellamutai97.workers.dev`. Custom domain to be added before client handoff.

### Done ✅ (continued)
- ✅ Customer exchange/return — sales guy logs returned + replacement product, stock updates both directions, admin sees exchange log on Sales tab
- ✅ Sales CRM feed — full message log per sale on admin Sales tab (buyer, product, amount, seller, time)
- ✅ Sales hourly graph — area chart of revenue per hour, last 12 hours, live
- ✅ Flour deduction on batch submit — DB trigger deducts the configured flour-per-mix rate for each product
- ✅ Flour stock unit fix — sacks remaining and days left now calculate correctly (kg converted to sacks via 1 sack = 50kg)
- ✅ Admin flour set stock — admin can set exact sack count to correct any discrepancy, alongside existing "Add flour" button

### Done ✅ (continued)
- ✅ Balance top-up webhook — Supabase Edge Function receives a forwarded payment SMS, parses amount + phone number, inserts into the payments table, DB trigger updates customer balance automatically. Secured with a webhook secret. Handles both 07XXXXXXXXX and 254XXXXXXXXX phone formats.

### Pending ⏳
- **Paystack test-mode integration** — replace the SMS-forwarding webhook with a proper cryptographically-verified Paystack webhook + top-up flow. No till number is used in this design.

---

## Setup Notes

- **Day one — flour stock:** Before workers start logging batches, admin must go to Stock tab → type the actual number of flour sacks in "Set exact sacks" and hit Set stock. After that, use "Add flour" whenever a new flour delivery arrives. The system deducts automatically every time a worker logs a batch.
- **Day one — data:** All test data has been cleared. The system starts clean.
- **Own Supabase project:** Point `.env` / `supabase/config.toml` at your own Supabase project — do not reuse someone else's live project.
