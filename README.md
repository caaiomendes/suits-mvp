# Suits MVP

Session-only chat for Brazilian lawyers to try AI quality and **USD cost** before a future SaaS. One specialist agent for now: **Criminalista**. Backend is [OpenRouter](https://openrouter.ai) (`/api/v1/chat/completions`). Swap models from the sidebar.

Auth and a database are intentionally out of scope. Nothing is persisted: refresh the page and the session is gone.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Server route proxies OpenRouter with `OPENROUTER_API_KEY`
- Prompts live as markdown under `prompts/`

## Setup

1. Copy the env template and add your key (never commit it):

```bash
cp .env.example .env.local
```

2. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys) and set:

```bash
OPENROUTER_API_KEY=sk-or-...
```

3. Install and run:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
pnpm dev      # local chat
pnpm build    # production build
pnpm start    # serve the build
pnpm lint
```

## Client demo flow

1. Confirm **Criminalista** in the agent selector (loads `prompts/criminalista/system.md`).
2. Pick a default model or paste any OpenRouter model id (for example `anthropic/claude-sonnet-4`, `openai/gpt-4o`, `google/gemini-2.5-pro`).
3. Type a question and optionally attach PDF, TXT, DOCX, or an image.
4. Watch the streamed answer. After each turn the right sidebar updates:
   - session cost in USD
   - prompt + completion tokens
5. Refresh the tab to start a new session.

PDF/TXT/DOCX text is injected into the user message. Images are sent as OpenRouter multimodal `image_url` parts (use a vision-capable model).

## Cost

OpenRouter streams a final `usage` object (prompt/completion tokens and usually `usage.cost`). The sidebar prefers that billed USD amount. If `cost` is missing, we estimate from the small pricing table in `lib/models.ts` for the default models. Edit that map when list prices change. Custom model ids without a table row still show tokens; USD stays at $0.00 unless OpenRouter sends `usage.cost`.

## Adding another agent

1. Create `prompts/<agent-id>/system.md` (Portuguese system prompt).
2. Optional: `prompts/<agent-id>/meta.json` with `{ "name", "description" }`.
3. Restart `pnpm dev`. The new folder appears in the agent selector.

The current Criminalista prompt is a **placeholder** — paste the real Drive prompt into `prompts/criminalista/system.md` when ready.

## Out of scope

- Login, NextAuth, Clerk, Supabase Auth
- Database / ORM / saved transcripts
- Billing beyond a live session estimate
