# Arnsoft Calling Agent

Internal voice-AI calling platform for **Arnsoft Tech**. Build and run conversational
phone/web agents — either as a visual workflow or a single-prompt agent — on our own
infrastructure with our own provider API keys (BYOK).

> Internal project — not for public distribution. Built on the open-source
> [Dograh](https://github.com/dograh-hq/dograh) platform (BSD 2-Clause, see [LICENSE](LICENSE));
> vendor cloud services (managed AI, telemetry, lead capture) are disabled in this deployment.

## Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.13 · FastAPI · SQLAlchemy (async) · Alembic · ARQ |
| Voice engine | pipecat (git submodule) — real-time STT → LLM → TTS pipeline |
| Frontend | Next.js 15 · React 19 · TypeScript · Tailwind + shadcn/ui · React Flow |
| Data | PostgreSQL 17 (pgvector) · Redis 7 · MinIO (S3) |
| Auth | Local JWT (`AUTH_PROVIDER=local`, `DEPLOYMENT_MODE=oss`) |
| AI providers | BYOK — OpenAI / Deepgram / ElevenLabs / Google / Azure / … configured per-org in the UI |
| Telephony | Twilio · Telnyx · Vonage · Plivo · Asterisk ARI (configured per-org in the UI) |

## Run locally (devcontainer)

1. Open the repo in VS Code → **Dev Containers: Reopen in Container** (Postgres/Redis/MinIO start automatically).
2. Backend (terminal 1):
   ```bash
   bash scripts/start_services_dev.sh
   ```
3. UI (terminal 2) — note the `--`:
   ```bash
   cd ui && npm run dev -- --hostname 0.0.0.0
   ```
4. Open http://localhost:3000 · health check: `curl localhost:8000/api/v1/health`

Stop backend services: `./scripts/stop_services.sh` · logs: `tail -f logs/latest/*.log`

**Known quirk:** after a devcontainer rebuild, the backend health check may take ~6s
(cloudflared tunnel probe) and the UI shows "Backend connection failed". Fix:
`echo "127.0.0.1 cloudflared" | sudo tee -a /etc/hosts`

## Common commands

```bash
# DB migrations
./scripts/makemigrate.sh          # create (interactive)
./scripts/migrate.sh              # apply

# Regenerate the typed UI API client after backend route/schema changes
# (backend must be running on :8000)
npm --prefix ui run generate-client

# Typecheck the UI
ui/node_modules/.bin/tsc --noEmit -p ui/tsconfig.json

# Tests (uses api/.env.test — never the dev DB)
source venv/bin/activate && set -a && source api/.env.test && set +a && python -m pytest api/tests/...
```

## Configuration

- `api/.env` — backend. Keep: `DEPLOYMENT_MODE=oss`, `AUTH_PROVIDER=local`,
  `ENABLE_TELEMETRY=false`, `MPS_API_URL=http://localhost:9` (vendor managed-AI cutoff).
  In the devcontainer, DB/Redis/MinIO hosts are the docker service names
  (`postgres`, `redis`, `minio`), not `localhost`.
- `ui/.env` — frontend. `NEXT_PUBLIC_ONBOARDING_API_URL=http://localhost:9` keeps
  lead-capture disabled.
- Branding lives in `ui/src/constants/brand.ts` (product name/tagline) and
  `ui/src/components/BrandLogo.tsx` (wordmark — swap in real logo files when ready).

## Repo layout

```
api/        FastAPI backend (routes/ · services/ · db/ · tasks/ · alembic/)
ui/         Next.js frontend (src/app/ · src/components/ · src/client/ = generated)
pipecat/    Voice pipeline framework (git submodule — merge upstream to update)
scripts/    Dev/deploy helper scripts
docs/       Mintlify docs (upstream)
```

## Notes for developers

- **Agents** come in two types: visual **Workflow** and **Single Prompt**
  (one `startCall` node; marker: `workflow_configurations.agent_type = 'single_prompt'`).
- **Tools** can be org-global or **agent-scoped** (`tools.workflow_id`); scoped tools are
  created inline from the agent editor and only visible to that agent.
- Every call run stores transcript + audio (MinIO `voice-audio` bucket) and metadata
  (`workflow_runs` table) **indefinitely** — no retention job yet. Recording is always on.
- `ui/src/client/` is generated — never edit by hand.
