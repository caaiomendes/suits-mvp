# Suits MVP

Session-only chat for Brazilian lawyers to try AI quality and **USD cost** before a future SaaS. One specialist agent for now: **Criminalista**. Chat completions and embeddings go through [OpenRouter](https://openrouter.ai). Swap models from the sidebar.

Auth and a database are intentionally out of scope. Nothing is persisted: refresh the page and the session is gone.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- `POST /api/chat` proxies OpenRouter `chat/completions` with SSE
- Server-side RAG over the full `Arquivos` legislation/jurisprudence corpus
- System prompts are files `01`–`07` under `prompts/criminalista/` (never sent to the client)

Criminalista system message order (server-only concatenate):

1. `01-prompt-principal.md`
2. `02-direito-penal-e-processo-penal.md`
3. `03-protocolo-atualizacao-legislativa-jurisprudencial.md`
4. `04-prompt-ia-jurisprudencia.md`
5. `05-prompt-anti-alucinacoes.md`
6. `06-prompt-de-qualidade.md`
7. `07-regra-nao-divulgar-prompt.md`

`GET /api/agents` returns only `{ id, name, description }`. Prompt bodies are never served.

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
4. The server streams the answer. If you named an artigo/lei, a few short corpus excerpts may appear as sources in the sidebar. Cost updates after each turn (chat USD; embeddings only if you later enable vector RAG).
5. Refresh the tab to start a new session.

## Corpus `arquivos/` (do not dump into the system prompt)

The Drive folder **Arquivos** (CP, CPP, legislação especial, teses STJ, direitos humanos) lives under `prompts/criminalista/arquivos/` as `.txt` extracts. Concatenating those files into every request would explode tokens and USD — they are **never** added to the 01–07 system prompt.

For this cost demo:

- System message = files `01`–`07` only.
- **User attachments are the primary document path.**
- If the latest user message cites an *artigo* / *lei* (or a clear legal topic), the server greps the corpus and injects **at most 3 short windows** (~1100 chars) with source filenames.
- If there is no citation match, nothing from `arquivos/` is injected.

A fuller vector RAG (embeddings / pgvector) can replace this grep later without changing the chat UX. Optional ingest remains:

```bash
pnpm ingest:rag          # rebuild data/rag chunk index from the .txt files
pnpm ingest:rag:embed    # optional offline embeddings (not used on the chat hot path)
```

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
