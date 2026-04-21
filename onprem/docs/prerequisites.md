# Prerequisites

## Host sizing

| Tier      | Users     | vCPU | RAM   | Disk  | Notes                                    |
|-----------|-----------|------|-------|-------|------------------------------------------|
| Eval      | <10       | 2    | 4 GB  | 20 GB | Bundled Ollama disabled                  |
| Small     | 10–100    | 4    | 8 GB  | 50 GB | External SMTP, no local LLM              |
| Medium    | 100–500   | 8    | 16 GB | 200 GB| Add Ollama on a 2nd GPU host             |
| Large     | 500–2000  | 16   | 32 GB | 500 GB| Postgres on its own host; S3 for uploads |

## OS

- Linux x86_64 (Ubuntu 22.04+, RHEL 9+, Debian 12+)
- Docker Engine 24+
- Docker Compose v2 (built-in `docker compose`, not the legacy `docker-compose`)

## Network

| Port | Direction | Purpose                            |
|------|-----------|------------------------------------|
| 80   | inbound   | Redirect to 443                    |
| 443  | inbound   | HTTPS for the web UI + API gateway |
| 25/465/587 | outbound | SMTP relay                    |

The host should resolve `DOMAIN` (set in `.env`) to its public IP.

## TLS

Place a certificate chain at `onprem/tls/fullchain.pem` and key at
`onprem/tls/privkey.pem`. The `web` container picks them up automatically.

For Let's Encrypt:

```bash
certbot certonly --standalone -d $DOMAIN
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem onprem/tls/
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem   onprem/tls/
```

## SMTP

You must supply SMTP credentials before installing — invites, password resets,
and MFA challenges all require email delivery. See [smtp.md](./smtp.md).
