# Intermediary — AI Intermediary Chat v1

A small-team app (2–5 people) where everyone works privately with their own AI, publishes what they build as **artifacts**, and changes each other's work through **proposals** the whole team approves. Think Git for AI conversations: the team collaborates on the artifact, never the chat.

Stack: Next.js 16 (App Router, TypeScript) on Vercel, Supabase (Postgres, Auth, Row Level Security), and a model adapter layer for Claude, OpenAI and Gemini.

## How it works

1. **Private thread.** Each member chats with the model they pick. Threads and messages are visible to their owner only (enforced by RLS).
2. **Publish.** "Publish as new artifact" takes the AI's latest fenced block (or any reply), drafts a summary with the AI, and lets the author edit both before sharing. The first version is official.
3. **Fork.** Anyone can fork an artifact version (or a teammate's proposal) into a new private thread. The fork starts from the artifact and its summary, never the original chat.
4. **Propose.** From a forked thread, "Propose change" sends a diff plus an AI-drafted summary for review. Sending counts as the author's approval.
5. **Review.** Every member except the author must approve. Any rejection (with a comment) sends it back; the author revises in their thread and resends, which starts a new revision. When the last approval lands, the proposed version becomes the new official version, and every other in-flight proposal on that artifact is marked **needs rebase**. The author presses **Rebase** and their AI re-applies the change to the new official version.

All transitions on shared objects run in Postgres functions (`supabase/migrations/*_init.sql`): `publish_artifact`, `create_proposal`, `revise_proposal`, `cast_review`, `accept_invite`. Clients can only read shared tables; they can't write them directly.

## Setup

### 1. Supabase

1. Create a project at supabase.com.
2. Run the migrations: either `supabase link --project-ref <ref> && supabase db push`, or paste each file in `supabase/migrations/` (in order) into the SQL editor and run it.
3. Auth > URL Configuration: set **Site URL** to your Vercel URL and add `https://<your-domain>/auth/confirm` (and `http://localhost:3000/auth/confirm` for local dev) to **Redirect URLs**.
4. Copy the project URL and the publishable key from Project Settings > API.

### 2. Local dev

```bash
cp .env.example .env.local   # fill in Supabase + at least one AI key
npm install
npm run dev
```

### 3. Vercel

Import the repo in Vercel (framework: Next.js, no build settings to change) and add the same environment variables as `.env.local`, with `NEXT_PUBLIC_SITE_URL` set to the production URL. Chat streaming and rebases use up to 300 seconds per request (`maxDuration`).

## Inviting teammates

The workspace creator invites people by email on the Members page. Invitees sign up with that email and accept from their workspaces page. The app doesn't send invite emails itself in v1.

## Not in v1

Per the plan: roles, teams over 5, majority votes, several AIs in one thread, automatic conflict resolution and live co-editing. Push/email notifications for pending votes are also not built yet; the feed shows "Waiting on your vote".
