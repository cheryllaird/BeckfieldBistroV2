# Beckfield Bistro

An AI-powered culinary companion built with React, TypeScript, Vite, Firebase, and Vercel.

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
| `vercel.app` | All PR preview deployments (`beckfield-bistro-git-*-cheryllairds-projects.vercel.app`) |

> **Why `vercel.app`?** Vercel preview URLs are dynamic (e.g. `beckfield-bistro-git-my-branch-cheryllairds-projects.vercel.app`), so you can't add each one individually. Adding `vercel.app` covers all of them at once. Firebase still enforces your Firestore security rules, so this doesn't weaken data security.

### 3. Google OAuth authorized origins

In **Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client**, add the same domains to **Authorized JavaScript origins**:

- `https://beckfield-bistro.vercel.app`
- `https://beckfield-bistro-cheryllairds-projects.vercel.app`
- `https://vercel.app` (covers previews)

### 4. Install and run

```bash
npm install
npm run dev
```

## Tech stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Auth + DB**: Firebase (Google Sign-in, Firestore)
- **AI**: Gemini (recipe extraction via Vercel serverless function)
- **Hosting**: Vercel
