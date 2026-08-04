# Setup Guide

Everything you need after cloning SafeHer.

## Prerequisites

| Tool | Version | Notes |
|------|---------|--------|
| [Bun](https://bun.sh) | 1.3.7+ | Package manager & runtime |
| [Docker](https://docs.docker.com/get-docker/) | recent | Runs PostgreSQL (with pgvector) |
| [Docker Compose](https://docs.docker.com/compose/) | v2+ | Bundled with Docker Desktop / Docker Engine |

Optional (only for data pipelines):

- `GEMINI_API_KEY` — news classification / AI features
- `DATA_GOV_API_KEY` — India data.gov.in crime import

## 1. Clone & install

```bash
git clone <repo-url> SafeHer
cd SafeHer
bun install
```

## 2. Environment files

`.env` files are gitignored. Create them from the templates below.

### `apps/server/.env`

```env
BETTER_AUTH_SECRET=generate-a-random-string-at-least-32-chars
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
DATABASE_URL=postgresql://postgres:password@localhost:5432/safe-her

# Optional — AI / data import scripts
GEMINI_API_KEY=
DATA_GOV_API_KEY=
```

Generate a secret:

```bash
openssl rand -base64 32
```

### `apps/web/.env`

```env
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

> `DATABASE_URL` must match the Docker Postgres credentials in `packages/db/docker-compose.yml` (default user `postgres`, password `password`, db `safe-her`, port `5432`).

## 3. Start Postgres with Docker

From the **repo root**:

```bash
# start in background
bun run db:start

# or attach logs (foreground)
bun run db:watch
```

These run Docker Compose from `packages/db/docker-compose.yml`:

| Service | Image | Host port | Credentials |
|---------|-------|-----------|-------------|
| `postgres` | `pgvector/pgvector:pg18` | `5432` | user `postgres` / pass `password` / db `safe-her` |

Useful Docker commands:

```bash
bun run db:stop    # stop containers (keep data)
bun run db:down    # stop & remove containers (volume kept unless you add -v)

# or from packages/db:
cd packages/db
docker compose up -d
docker compose ps
docker compose logs -f postgres
docker compose down
```

Confirm Postgres is healthy:

```bash
docker compose -f packages/db/docker-compose.yml ps
# or
docker exec safe-her-postgres pg_isready -U postgres
```

## 4. Apply the database schema

```bash
bun run db:push
```

Other DB scripts:

```bash
bun run db:generate   # regenerate Prisma client
bun run db:migrate    # create/run migrations
bun run db:studio     # Prisma Studio UI
```

## 5. Run the apps

```bash
bun run dev
```

| App | URL |
|-----|-----|
| Web (Next.js) | http://localhost:3001 |
| API (Hono) | http://localhost:3000 |

Single apps:

```bash
bun run dev:web
bun run dev:server
```

## Quick start (checklist)

```bash
bun install
# create apps/server/.env and apps/web/.env (see above)
bun run db:start
bun run db:push
bun run dev
```

## Troubleshooting

**Port 5432 already in use**  
Stop the local Postgres service, or change the host port mapping in `packages/db/docker-compose.yml` and update `DATABASE_URL`.

**Docker daemon not running**  
Start Docker Desktop / `sudo systemctl start docker`, then retry `bun run db:start`.

**Auth / env validation errors**  
`BETTER_AUTH_SECRET` must be at least 32 characters. URLs must be valid (`http://...`).

**Prisma client missing**  
Run `bun run db:generate` (also runs on `bun install` via postinstall).

## Optional data scripts

Run from `packages/db` after env + DB are ready (some need API keys in `apps/server/.env` or the shell):

```bash
cd packages/db
bun run db:import              # historical import
bun run db:seed-incidents      # seed sample incidents
bun run db:fetch               # data.gov.in crime data
bun run db:fetch-news          # GDELT news
bun run db:fetch-news-gkg      # GDELT GKG
bun run db:cleanup-news        # cleanup news rows
```

## Project layout

```
SafeHer/
├── apps/
│   ├── web/          # Next.js frontend :3001
│   └── server/       # Hono API :3000
├── packages/
│   ├── db/           # Prisma + docker-compose.yml
│   ├── auth/         # Better Auth
│   ├── ui/           # shared shadcn/ui
│   ├── env/          # env validation
│   └── config/       # shared TS config
└── SETUP.md          # this file
```
