Seat reservation API (Node + Express + Postgres + Redis) built to stay correct under an on-sale stampede: no double-sells, per-user limits and idempotent retries. Design decisions are in [WRITEUP.md](WRITEUP.md).

- Live: https://paytm-task-yfx0.onrender.com (API at `/api/v1`, e.g. [`/api/v1/health/ready`](https://paytm-task-yfx0.onrender.com/api/v1/health/ready))
- Repo: https://github.com/Sunny-Daze/PTM-task — clone with `git clone https://github.com/Sunny-Daze/PTM-task.git && cd PTM-task`

## Local setup (Docker)

Requires Docker with Compose.

cp .env.example .env         
docker compose up --build


- Starts the API on `http://localhost:8000` plus Postgres and Redis.
- Migrations run automatically when the app container starts (set `RUN_MIGRATIONS=false` to skip them).
- Check it's up: `curl http://localhost:8000/api/v1/health/ready`

Ports can be changed in `.env` with `APP_PORT`, `POSTGRES_PORT` and `REDIS_PORT`.

## Local setup (without Docker)

Requires Node 24, plus Postgres and Redis running locally (`docker compose up -d postgres redis` works).

npm install
cp .env.example .env
npm run db:up                 # run migrations
npm run dev                   # watch mode on PORT

## Burst test

Reproduces the on-sale stampede against any running instance and prints the outcome distribution and final reconciliation. Needs Node 18+, no install. Pass the base URL (`/api/v1` is added for you):

npm run burst -- http://localhost:8000         
./burst.sh http://localhost:8000               
./burst.sh https://paytm-task-yfx0.onrender.com --users 5000

| Flag | Default | Meaning |
|---|---|---|
| `--users` | 1000 | Concurrent buyers (each logs in separately) |
| `--seats` | 200 | Seats in the show it creates |
| `--hot-seats` | 3 | Seats everyone fights over |
| `--limit` | 4 | Per-user limit for the show |
| `--login-concurrency` | 100 | Parallel logins during setup |
| `--no-confirm` | off | Leave winning holds unconfirmed |

Each run creates a fresh show and users, then runs a hot-seat storm, a random-seat stampede, idempotent retries, a per-user limit check and confirms, and finally checks `available + held + confirmed == total_seats`. It prints p50/p95/p99 latency per phase, outcomes by type, and a PASS/FAIL list; the exit code is non-zero if any check fails.

Running it against a shared or live database leaves the test shows and users behind.
