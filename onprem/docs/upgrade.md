# Upgrade

TaskMaster on-prem uses **versioned signed bundles**. Each release is a single
tarball containing pre-built images, ordered SQL migrations, the web bundle,
and a signed manifest.

## Connected sites

```bash
cd /opt/taskmaster
./scripts/pimp-cli download v1.4.0
./scripts/pimp-cli verify   v1.4.0
./scripts/pimp-cli upgrade  v1.4.0
```

## Air-gapped sites

1. On a machine with internet, download `taskmaster-v1.4.0.tar.gz` and
   `taskmaster-v1.4.0.tar.gz.sig`.
2. Transfer both files to the install host (USB, internal mirror, etc.).
3. Place them under `bundles/`:
   ```
   bundles/
   └── v1.4.0.tar.gz
   └── v1.4.0.tar.gz.sig
   ```
4. Then:
   ```bash
   tar -xzf bundles/v1.4.0.tar.gz -C bundles/v1.4.0
   ./scripts/pimp-cli verify  v1.4.0
   ./scripts/pimp-cli upgrade v1.4.0
   ```

## What `upgrade.sh` does

1. **Verify** the bundle signature against `keys/release.pub.pem`.
2. **Pre-flight**: check disk space, DB reachability, version chain.
3. **Backup**: `pg_dump` to `backups/pre-vX.Y.Z-<timestamp>.sql.gz`.
4. **Load** new images via `docker load`.
5. **Migrate**: apply only SQL files not already in `public.schema_version`.
6. **Swap** the static web bundle.
7. **Restart** `edge`, `web`, `kong` with the new `IMAGE_TAG`.
8. **Health gate**: poll `healthcheck.sh` for up to 2 minutes. If anything
   fails, automatically run `rollback.sh`.

## Rollback

Manual rollback at any time:

```bash
./scripts/pimp-cli rollback
```

This restores the most recent pre-upgrade DB snapshot and re-pins the previous
`IMAGE_TAG`. Note: rollback restores DB state to the moment **before** the
last upgrade. Any data created since the upgrade will be lost — restore from
a full backup if you need a different point in time.

## Skipping versions

A bundle's `manifest.json` declares `min_previous_version`. If your installed
version is older, `upgrade.sh` will refuse and ask you to upgrade
incrementally. We support a 3-version skip range; older installs need to step
through intermediate releases.

## Update channels

Set `UPDATE_CHANNEL` in `.env` to:

- `stable` — recommended for production (default)
- `beta`   — early access, recommended for staging
- `lts`    — long-term-support, slower cadence, only critical fixes

Channel only affects `pimp-cli download` defaults. `pimp-cli download v1.4.0`
always works regardless of channel.
