# FaceRoots

**Discover where your face comes from.**

FaceRoots is a mobile-first PWA that compares your facial features with those of your family members and produces a playful, narrated "Family DNA Map" — showing which feature resembles which relative and by how much.

> **Fun resemblance analysis — not a genetic or paternity test.**

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| Animation | Framer Motion |
| State | TanStack Query + Zustand |
| Face detection (client) | MediaPipe FaceLandmarker (WASM) |
| Auth / DB / Storage | Supabase (magic link + Google OAuth) |
| Vector search | Supabase pgvector (HNSW) |
| Face embeddings | InsightFace `buffalo_l` via Replicate |
| Feature embeddings | DINOv2 ViT-S/14 via Replicate |
| LLM narration | Google Gemini 2.5 Flash Vision |
| Share card | Satori + resvg-wasm (Edge Function → PNG) |
| Analytics | PostHog |
| Error tracking | Sentry |
| i18n | react-i18next (English only in v1) |

---

## Local development

### Prerequisites

- Node.js ≥ 18 or Bun ≥ 1.0
- [Supabase CLI](https://supabase.com/docs/guides/cli) ≥ 1.200
- A Supabase project (free tier works)

### 1. Clone & install

```bash
git clone https://github.com/swastik1987/face-roots-canvas.git
cd face-roots-canvas
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env.local
```

```env
# .env.local
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_POSTHOG_KEY=<posthog-project-api-key>       # optional
VITE_SENTRY_DSN=<sentry-dsn>                     # optional
VITE_APP_VERSION=0.1.0
```

### 3. Run database migrations

```bash
supabase link --project-ref <project-ref>
supabase db push
```

This applies all migrations in `supabase/migrations/` in order.

### 4. Deploy Edge Functions

```bash
supabase functions deploy validate-face
supabase functions deploy embed-face
supabase functions deploy embed-features
supabase functions deploy match-features
supabase functions deploy narrate-matches
supabase functions deploy render-legacy-card
supabase functions deploy run-analysis
supabase functions deploy delete-my-data
```

### 5. Set Edge Function secrets

```bash
supabase secrets set \
  REPLICATE_API_TOKEN=<token> \
  GOOGLE_AI_STUDIO_KEY=<key> \
  SENTRY_DSN_EDGE=<dsn> \
  DAILY_IP_HASH_SALT=$(openssl rand -hex 32) \
  POLICY_VERSION=v1.0.0
```

### 6. Start the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:8080`.

---

## Deployment (Lovable + GitHub sync)

This project uses **Lovable Cloud** as its deployment platform, synced from GitHub.

1. Push changes to the `main` branch on GitHub.
2. Lovable detects the push and rebuilds the frontend automatically.
3. The live URL is managed via the Lovable project dashboard.

Edge Functions and migrations are **not** auto-deployed by Lovable — run the `supabase` CLI commands above against your production project when schema or function changes land.

---

## Environment variables reference

### Frontend (`VITE_*` — public, safe to expose)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key |
| `VITE_POSTHOG_KEY` | No | PostHog project API key |
| `VITE_SENTRY_DSN` | No | Sentry DSN for frontend errors |
| `VITE_APP_VERSION` | No | Semver string stamped on Sentry releases |

### Edge Functions (Supabase secrets — keep private)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Auto-injected by Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Auto-injected by Supabase runtime |
| `SUPABASE_ANON_KEY` | Yes | Auto-injected by Supabase runtime |
| `REPLICATE_API_TOKEN` | Yes | Replicate API token (InsightFace + DINOv2) |
| `GOOGLE_AI_STUDIO_KEY` | Yes | Gemini 2.5 Flash API key |
| `SENTRY_DSN_EDGE` | No | Sentry DSN for Edge Function errors |
| `DAILY_IP_HASH_SALT` | Yes | Random hex salt (rotate daily via cron) |
| `POLICY_VERSION` | Yes | Privacy policy version string, e.g. `v1.0.0` |

---

## Project structure

```
face-roots-canvas/
├── CLAUDE.md              # AI development context & phase plan
├── RISKS.md               # Bias audit & risk register
├── README.md              # This file
├── src/
│   ├── i18n.ts            # i18next initialisation
│   ├── locales/en.json    # English strings
│   ├── lib/
│   │   ├── supabase.ts    # Supabase client + type aliases
│   │   ├── analytics.ts   # PostHog wrapper
│   │   ├── sentry.ts      # Sentry React wrapper
│   │   └── face/          # MediaPipe integration
│   ├── components/
│   │   ├── ui/            # shadcn/ui primitives
│   │   ├── layout/        # AppShell, BottomTabBar
│   │   ├── consent/       # ConsentModal
│   │   └── results/       # FaceSilhouette, FeatureCard
│   ├── pages/             # Route components
│   ├── stores/            # Zustand stores
│   └── contexts/          # AuthContext
└── supabase/
    ├── functions/         # Deno Edge Functions
    │   ├── _shared/       # Shared utilities & card templates
    │   ├── validate-face/
    │   ├── embed-face/
    │   ├── embed-features/
    │   ├── match-features/
    │   ├── narrate-matches/
    │   ├── render-legacy-card/
    │   ├── run-analysis/
    │   └── delete-my-data/
    └── migrations/        # PostgreSQL migrations (000N_*.sql)
```

---

## Key design decisions

- **No raw face images leave the device** until explicit consent is recorded in `consent_events`.
- **pgvector only** — no external vector store. All similarity search happens inside Supabase.
- **Edge Functions only** — all backend ML logic runs in Deno. No self-hosted servers.
- **RLS on every table** — rows are scoped to `auth.uid()`. The service role key is used only in Edge Functions, never in client code.
- **Model version stamping** — every `analyses` row records exact model IDs so results stay explainable across upgrades.

---

## Legal

FaceRoots is a fun visual resemblance tool. It makes **no claims about genetics, DNA, parentage, or biological relationships**. See `RISKS.md` for the full risk register and bias audit plan.
