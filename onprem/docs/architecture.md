# Architecture

TaskMaster on-prem runs as a single `docker compose` stack on one host.
All components are containerized and require no external dependencies
beyond Postgres (which we bundle) and an SMTP relay (which you provide).

## Services

| Service    | Image                              | Purpose                               |
|------------|------------------------------------|---------------------------------------|
| `db`       | `onprem-db` (Postgres 15 + ext)    | Primary data store + auth schema      |
| `auth`     | `onprem-auth` (GoTrue)             | Email/password, SSO, MFA              |
| `realtime` | `onprem-realtime`                  | Postgres → WebSocket fan-out          |
| `storage`  | `onprem-storage`                   | File uploads (local FS or S3)         |
| `edge`     | `onprem-edge` (Deno)               | Business logic — every `supabase/functions/*` |
| `kong`     | `onprem-kong`                      | API gateway, JWT validation           |
| `web`      | `onprem-web` (nginx + Vite build)  | React SPA + TLS termination           |
| `ollama`   | `ollama/ollama` *(optional)*       | Local LLM inference                   |

## Data flow

```
browser ──► web (nginx) ──► kong ──► { auth | rest | realtime | storage | edge }
                                        │
                                        ▼
                                       db (Postgres)
```

The browser only ever talks to `web` and `kong`. Internal services are not
exposed on the host network.

## Persistence

| Volume          | Contents                                          |
|-----------------|---------------------------------------------------|
| `db-data`       | Postgres data dir                                 |
| `storage-data`  | User-uploaded files (when `STORAGE_DRIVER=file`)  |
| `ollama-models` | Downloaded local LLM weights                      |
| `./backups/`    | `pg_dump` output and uploads tarballs             |
| `./bundles/`    | Release bundles (one directory per version)       |

## Outbound network

By default, **zero** outbound traffic is required. When `ALLOW_OUTBOUND_TELEMETRY=true`:

- `edge` polls `updates.taskmaster.app` for new release manifests
- `edge` may submit anonymized health metrics

This is configurable per-org in the Platform Admin UI.
