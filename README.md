# Beckfield Bistro

Run your kitchen like a bistro. Recipes, meal plans and shopping lists, shared with your household. Built with React, TypeScript, Vite, Firebase, and Vercel.

## Setup

### 1. Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```
cp .env.example .env.local
```

All `VITE_FIREBASE_*` values come from **Firebase Console → Project Settings → Your apps → Web app**.

### 2. Firebase authorized domains

Google Sign-in requires the domain your app runs on to be in Firebase's authorized list.

**Firebase Console → Authentication → Settings → Authorized domains**

Add all of the following:

| Domain | Purpose |
|--------|---------|
| `localhost` | Local dev (added by default) |
| `beckfield-bistro.vercel.app` | Production |
| `beckfield-bistro-cheryllairds-projects.vercel.app` | Vercel team alias |

> **Do not add `vercel.app` itself.** Anyone can deploy a site under `*.vercel.app`, so authorizing the whole domain lets an attacker's site run Google Sign-in against this Firebase project and capture users' sessions. To sign in on a preview deployment, add that preview's exact hostname temporarily (or put previews on a custom domain you own) and remove it afterwards.

### 3. Google OAuth authorized origins

In **Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client**, add the same domains to **Authorized JavaScript origins**:

- `https://beckfield-bistro.vercel.app`
- `https://beckfield-bistro-cheryllairds-projects.vercel.app`

### 4. Deploy the Firestore security rules

`firestore.rules` is the only thing standing between the public web API key and the database, and nothing deploys it automatically. Deploy it whenever it changes, and check that **Firebase Console → Firestore → Rules** matches the file:

```bash
npx firebase-tools deploy --only firestore:rules --project <your-project-id>
```

### 5. Firestore TTL policies

Shared recipes and bistro invites hold the email address of someone who may never sign in, so they expire after 90 days. Each doc carries an `expiresAt` timestamp, and a Firestore TTL policy deletes it after that time (usually within a day; the API also hides expired ones straight away). The policies are project settings, not code, so create them once per project:

```bash
gcloud firestore fields ttls update expiresAt --collection-group=sharedRecipes --enable-ttl --project <your-project-id>
gcloud firestore fields ttls update expiresAt --collection-group=bistroInvites --enable-ttl --project <your-project-id>
```

Or in **Firebase Console → Firestore → TTL**. Docs created before `expiresAt` was added need it set once, with `node scripts/backfill-pending-expiry.mjs` (a dry run; add `--apply` to write).

### 6. Install and run

```bash
npm install
npm run dev
```

## Testing

```bash
npm test               # run the suite once
npm run test:watch     # re-run on change
npm run test:coverage  # with a coverage report
npm run typecheck      # app + test types
```

Tests use [Vitest](https://vitest.dev) and sit next to the code they cover (`*.test.ts` / `*.test.tsx`).
There are two projects, configured in `vitest.config.ts`:

- **unit** (`*.test.ts`, Node): pure logic in `src/lib` and `api/_utils`.
- **dom** (`*.test.tsx`, jsdom + React Testing Library): components, hooks and the Zustand store.

Firestore and IndexedDB are replaced by `src/lib/__mocks__` via `vi.mock(...)`, and shared test data builders
live in `src/test/factories.ts`. CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every PR.

The root `test-*.ts` scripts are separate manual smoke checks against live APIs, run with `npx tsx`.

## Tech stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Auth + DB**: Firebase (Google Sign-in, Firestore)
- **AI**: Gemini (recipe extraction via Vercel serverless function)
- **Hosting**: Vercel

## Install & deployment

- **Live URL**: https://beckfield-bistro.vercel.app. Vercel deploys every push to `main`; the service worker picks up updates silently.
- **iOS**: Safari → Share → "Add to Home Screen". **Android**: Chrome → "Install app" (or menu → "Add to Home Screen").

## Working with agents

Features are shipped by Claude agents through pull requests that a human reviews and merges. Start with:

- [`AGENTS.md`](AGENTS.md): rules, architecture map and definition of done for any agent.
- [`docs/agentic-workflow.md`](docs/agentic-workflow.md): how the workflow, guardrails and nightly agents fit together.
- [`docs/adr/`](docs/adr/README.md): architecture decision records.
- [`docs/friction-log.md`](docs/friction-log.md): what slows work down, so it can be fixed.
