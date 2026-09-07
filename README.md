# Suits MVP

Session-only chat for Brazilian lawyers to try AI quality and **USD cost** before a future SaaS. One specialist agent for now: **Criminalista**. Chat completions and embeddings go through [OpenRouter](https://openrouter.ai). Swap models from the sidebar.

Auth and a database are intentionally out of scope. Nothing is persisted: refresh the page and the session is gone.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- `POST /api/chat` proxies OpenRouter `chat/completions` with SSE
- Server-side RAG over the full `Arquivos` legislation/jurisprudence corpus
- System prompts are files `01`–`07` under `prompts/criminalista/` (never sent to the client)

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
pnpm dev                 # local chat
pnpm build               # production build
pnpm start               # serve the build
pnpm lint
pnpm ingest:rag          # rechunk prompts/criminalista/arquivos/*.txt → data/rag/
pnpm ingest:rag:embed    # same + OpenRouter embeddings (needs OPENROUTER_API_KEY)
```

## Client demo flow

1. Confirm **Criminalista** in the agent selector (loads `01`–`07` on the server).
2. Pick a default model or paste any OpenRouter model id.
3. Ask about an article or attach a PDF/TXT/DOCX/image.
4. The server retrieves top chunks from the corpus (never the whole file dump), streams the answer, and updates the sidebar:
   - session USD (chat + query embeddings)
   - prompt / completion / embedding tokens
   - source filenames used in that turn
5. Refresh the tab to start a new session.

## RAG

Production-shaped file index, ready to swap for pgvector/Supabase later without changing the chat UX.

1. **Ingest** (`scripts/ingest-criminalista-rag.ts`) reads every `.txt` under `prompts/criminalista/arquivos/`, chunks with overlap (~3600 chars / ~180 overlap, article-aware), and writes `data/rag/criminalista.chunks.jsonl` + `criminalista.meta.json`.
2. **Embeddings** use OpenRouter `POST /api/v1/embeddings` with `openai/text-embedding-3-small` (override via `OPENROUTER_EMBEDDING_MODEL`). Vectors are a gitignored binary (`data/rag/criminalista.embeddings.bin`) because the float32 matrix is large. Regenerate with `pnpm ingest:rag:embed`. `postinstall` generates them automatically when `OPENROUTER_API_KEY` is set and the file is missing (local or Vercel build). On Vercel the writable cache is `/tmp`.
3. **Query** (every Criminalista turn, server-only): embed the latest user message plus a short attachment excerpt; cosine top-k over the index; BM25 over the **full** chunk store; boost hits for citations like `art. 121`, `CP`, `CPP`; merge with reciprocal rank fusion (k≈10). Inject a delimited `BASE LEGAL (trechos recuperados)` block with source filenames. The raw corpus and prompt files are not imported by client components.
4. Without corpus embeddings (no key / not ingested yet) retrieval still runs **BM25 + citation boost over every chunk**, not a keyword stub. Hybrid (vector + BM25) turns on when the embeddings file is present.

### Regenerating the index

```bash
pnpm ingest:rag          # always safe, no API key
pnpm ingest:rag:embed    # requires OPENROUTER_API_KEY
```

Commit the `.txt` corpus and the chunk JSONL. Do not commit `.embeddings.bin`.

### Later: pgvector / Supabase

Keep `retrieveCriminalistaContext()` as the seam. Replace the file loader in `lib/rag/store.ts` with a SQL/pgvector query; ingest writes rows instead of JSONL. The chat route and UI stay the same.

## Cost

- Chat: OpenRouter stream `usage` (prefer `usage.cost`, else `lib/models.ts` table).
- Query embeddings: OpenRouter embeddings `usage.cost` when present, else `$0.02 / 1M` for `text-embedding-3-small`.
- Sidebar total = chat USD + embedding USD for the session. Corpus ingest embeddings are offline and not added to the live session.

## Adding another agent

1. `prompts/<agent-id>/01-….md` … system files (or a single `system.md`).
2. Optional `meta.json` with `{ "name", "description" }`.
3. Add a corpus + ingest target if that agent needs RAG.

Criminalista system prompts are the Drive texts in `01`–`07`. The knowledge base is the extracted `arquivos/*.txt` (PDFs were left on `feat/criminalista-prompts` to keep this repo lean).

## Out of scope

- Login, NextAuth, Clerk, Supabase Auth
- Database / ORM / saved transcripts
- Hosted vector DB (the file index is the stand-in)
