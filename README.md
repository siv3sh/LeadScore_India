# LeadScore (also LeadAI)

AI-powered lead scoring for D2C brands and local service businesses in India. Upload your leads as a CSV or Excel file, get conversion scores, and prioritize your outreach.

## What It Does

- **Upload CSV leads** — drag-and-drop your lead data, map columns to the expected schema
- **ML scoring** — a logistic regression model trained on your data scores each lead 0-100 by conversion probability
- **Prioritized dashboard** — filter by priority (High/Medium/Low) and source, sort by score
- **Suggested actions** — each lead gets a recommended next step ("Call today", "Send WhatsApp offer", etc.)
- **CSV export** — download the scored, filtered view
- **Subscription plans** — Starter (₹1,999/mo), Growth (₹4,999/mo), Pro (₹6,999/mo) via Razorpay

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **ML**: Pure-TypeScript logistic regression with gradient descent (runs in-browser)
- **Payments**: Razorpay (INR) via Supabase Edge Functions

## Local Development

```bash
npm install
npm run dev
```

The Supabase URL and anon key are pre-configured in `.env`. The app runs at `http://localhost:5173`.

## Multi-organization (org branch)

See [docs/ORG.md](docs/ORG.md) for schema, `npm run migrate:org`, the email stub,
and how to roll this back. Do not run the backfill on every server start.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

For Razorpay (configured as edge function secrets, not in `.env`):
- `RAZORPAY_KEY_ID` — Your Razorpay key ID
- `RAZORPAY_KEY_SECRET` — Your Razorpay key secret

## Razorpay Setup (Test Mode)

1. Create a Razorpay account at [razorpay.com](https://razorpay.com)
2. Go to **Settings → API Keys** and generate test mode keys
3. Set the edge function secrets:
   ```
   supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx
   supabase secrets set RAZORPAY_KEY_SECRET=xxx
   ```
   (Or use the Supabase dashboard → Edge Functions → Secrets)
4. The checkout flow uses Razorpay's standard checkout.js — test with card number `4111 1111 1111 1111`, any future expiry, any CVV

## CSV Format

### Upload

Any CSV or Excel works — Instagram ads, Google Sheets, WhatsApp exports. We auto-match name and phone (required to call), keep every other column, and you pick what shows on the list.

A converted / not converted column is optional. Without it, ranking uses source and how recently the lead arrived.

You can still download a sample file from the upload modal if you want a starting sheet.

## Scoring Logic

- **Target**: converted = 1 when status is converted (`won` in CSV); otherwise 0 for settled non-converted outcomes
- **Features**: days since lead created, days since last contact, num_orders, order_value, hour of day, day of week, source (one-hot encoded), num contacts
- **Model**: Logistic regression with 200 epochs of gradient descent, 80/20 train/test split
- **AUC** is computed and displayed as a model quality metric
- **Priority**: High (71-100), Medium (41-70), Low (0-40)

## Subscription Plans

| Plan | Price | Lead Limit |
|------|-------|------------|
| Free Trial | ₹0 | 100/month |
| Starter | ₹1,999/mo | 1,000/month |
| Growth | ₹4,999/mo | 10,000/month |
| Pro | ₹6,999/mo | 50,000/month |

## Deployment

### Deploy to Vercel / Netlify / Render

1. Build the project: `npm run build`
2. Deploy the `dist/` folder
3. Set environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
4. Edge functions are already deployed to Supabase — no additional hosting needed

### Architecture

```
src/
  lib/
    supabase.ts     — Supabase client singleton
    auth.ts         — useAuth hook
    csvParser.ts    — CSV parsing, column mapping, sample generation
    ml.ts           — Logistic regression model (train, predict, score)
    api.ts          — Upload processing, lead fetching, CSV export
  contexts/
    AuthContext.tsx — Auth state, workspace/subscription loading
  pages/
    AuthPage.tsx    — Sign in / sign up
    Dashboard.tsx   — Main dashboard with upload, table, filters
    PlansPage.tsx   — Subscription plans and Razorpay checkout
  types/
    index.ts        — Shared types and plan definitions

supabase/
  functions/
    razorpay-checkout/  — Creates Razorpay order
    razorpay-verify/    — Verifies payment, activates subscription
```
