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
cp .env.example .env.local   # fill in Supabase + PROVIDER_KEYS_SECRET (openssl rand -base64 32)
npm install
npm run dev
```

### 3. Vercel

Import the repo in Vercel (framework: Next.js, no build settings to change) and add the same environment variables as `.env.local`, with `NEXT_PUBLIC_SITE_URL` set to the production URL. Chat streaming and rebases use up to 300 seconds per request (`maxDuration`).

## MCP App (use Intermediary from Claude, ChatGPT, VS Code…)

`/api/mcp` is a remote MCP server (streamable HTTP, stateless) with an [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) UI. The connected AI acts as your private AI: it can read the team's artifacts, publish new ones, propose changes, and show an interactive review screen (diff + Approve/Reject) inline in the chat.

| Tool | What it does | UI |
|---|---|---|
| `list_workspaces` | Workspaces you're in | |
| `show_workspace` | Artifacts, open proposals, what's waiting on your vote | ✓ |
| `get_artifact` | Current official version, full content | ✓ |
| `review_proposal` | Summary, diff and votes | ✓ |
| `cast_review` | Approve / reject (only when you say so) | ✓ |
| `publish_artifact` | Share new work with the team | ✓ |
| `propose_change` | Propose a new version of an artifact | ✓ |

**Auth.** MCP clients sign in through Supabase Auth's OAuth 2.1 server, so they act as your existing account and every RLS rule still applies. The app serves the protected-resource metadata (`/.well-known/oauth-protected-resource/api/mcp`), verifies tokens against the project's JWKS, and hosts the consent screen at `/oauth/consent`. People can revoke connected apps under **AI keys**.

**Setup**

1. Supabase dashboard → Authentication → **OAuth Server**: enable it, set the authorization path to `/oauth/consent`, and enable **dynamic client registration** (MCP clients register themselves).
2. Authentication → URL Configuration: the **Site URL** must be the app's public URL (the authorization path is resolved against it).
3. The server must be reachable over public HTTPS (Claude connects from its own servers, not your machine): deploy to Vercel, or for local testing run a tunnel such as `cloudflared tunnel --url https://localhost:3001 --no-tls-verify` and use that URL as the Site URL.
4. In Claude: Settings → Connectors → **Add custom connector** → `https://<your-host>/api/mcp`, then sign in and press Allow.

## Bring your own AI keys

Each person adds their own Anthropic, OpenAI or Gemini API key under **AI keys** (`/settings`), and their private threads, summaries and rebases run on (and bill to) their own account. Keys are checked with the provider before saving, encrypted with AES-256-GCM using `PROVIDER_KEYS_SECRET`, and stored in `user_provider_keys`, which only the owner can read. The app never shows a key again. The `*_API_KEY` env vars are optional shared fallbacks used only for a provider someone hasn't connected; leave them blank to require everyone to bring their own.

## Inviting teammates

The workspace creator copies the **invite link** from the Members page and sends it however they like. Anyone who opens it signs in (or creates an account) and lands on a one-click Join page, up to 5 members. "Reset link" invalidates the old one. Inviting by email still works too: invitees sign up with that email and accept from their workspaces page. The app doesn't send invite emails itself.

The creator can also **remove** members from the Members page. That closes the removed person's in-flight proposals (shown as "Closed (author left)"), re-checks everyone else's open proposals (one fewer approval is now needed, so some may be accepted right away), deletes their private threads in that workspace, and resets the invite link.

### Demo accounts

`supabase/seed-demo.sql` creates four confirmed users (`demo1@example.com` … `demo4@example.com`, password `demo-pass-2026`) and adds them to a workspace. Set `owner_email` at the top and run it in the SQL editor. It's safe to re-run.

## Not in v1

Per the plan: roles, teams over 5, majority votes, several AIs in one thread, automatic conflict resolution and live co-editing. Push/email notifications for pending votes are also not built yet; the feed shows "Waiting on your vote".
