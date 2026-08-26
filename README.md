# EllaCakeHub 🎂

A real-time bakery operations platform that gives an owner a live, phone-in-hand view of their entire business — production, stock, deliveries, sales, and staff — without a single phone call. Built as a full-stack portfolio project after a client engagement wrapped up; product names, pricing, and business data shown here are fictional demo data.

**Live demo:** https://live-cake-flow.daniellamutai97.workers.dev — login uses PIN-based quick-select cards (no signup needed), just pick a role and go.

## The Problem

Small-scale bakeries running a produce → deliver → sell pipeline typically coordinate it all by phone calls and word of mouth: a worker tells someone how many cakes they made, a delivery driver calls when they've left, sales staff call back with what actually arrived. Numbers get miscounted, nothing is timestamped, and the owner only finds out something went wrong once it's too late to fix — a generic POS or inventory tool doesn't model this specific produce-deliver-sell-reconcile workflow, or the prepaid customer wallet model bakeries here actually use.

## What It Does

- 📊 **Live, role-based dashboards** — Admin, Worker, Sales, and Delivery each see only what's relevant to them, updating in real time with no manual refresh
- 💳 **Prepaid customer wallets** — customers top up a balance via Paystack (test mode, M-Pesa/card checkout); a sale is blocked automatically if it would exceed their balance
- 🚚 **Delivery ↔ Sales handshake** — a delivery trip isn't complete until both sides independently confirm crate counts; any mismatch is automatically flagged for the admin
- 🏭 **Full production tracking** — flour usage, mixes, crates, and stock levels flow automatically from a worker logging a batch through to what's sellable at the marketplace
- 🔐 **PIN-based role login** — no email/password friction for shop-floor staff
- 📈 **Live sales analytics** — hourly revenue chart, product performance, and a running CRM-style feed of every sale

## Tech Stack

- **TanStack Start** (React, SSR) — frontend
- **Supabase** (PostgreSQL) — database, realtime, auth, edge functions, row-level security
- **Paystack** (test mode) — payment initialization + webhook-based wallet crediting
- **Cloudflare Workers** — hosting

## System Modules

- **Admin Dashboard** — sales analytics, per-product stock and flour tracking, day/night shift comparison, staff hours, crate discrepancy log
- **Worker** — batch/mix logging with auto shift detection (day/night), no visibility into sales or flour figures
- **Sales** — customer balance search, wallet top-ups, sale recording with retail/wholesale pricing, delivery receipt confirmation, exchanges/returns
- **Delivery** — full trip lifecycle (collect crates → depart → arrive → handoff), crate return confirmation against sales' count
- **Payments** — Paystack initialize + signature-verified webhook edge functions; idempotent via a database-level unique constraint, so a retried webhook can never double-credit a balance

## Architecture Notes

- Business logic — stock deduction, flour consumption, balance updates — runs as Postgres triggers, not frontend code, so it can't be bypassed by a buggy or malicious client.
- Every table has RLS policies scoped per role, so access control is enforced by Postgres itself, not just hidden in the UI.

`CLIENT_SPEC.md` in this repo documents the original product spec (roles, workflows, business rules) in more detail.

