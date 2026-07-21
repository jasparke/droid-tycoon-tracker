# droid-tycoon (homelab stack)

Droid Tycoon rebirth tracker — SvelteKit + Postgres, authenticated via Authentik OIDC
SSO ("Sign in with Google"). Public web-app class, exposed at
`https://droid-tycoon.pkfd.net` via cloudflared → Traefik. See the design spec:
[`docs/superpowers/specs/2026-07-17-authentik-oidc-sso-design.md`](../../docs/superpowers/specs/2026-07-17-authentik-oidc-sso-design.md)
in the `droid-tycoon-tracker` repo.

This directory (`compose.yaml`, `.env.example`, this README) is authored and versioned
in the `droid-tycoon-tracker` repo, alongside the app it deploys. At deploy time it's
copied into (or symlinked from) `~/Projects/homelab/thelab/stacks/droid-tycoon/`, or
Komodo is pointed at this path directly.

**Decision to confirm with Jason:** homelab stacks use pre-built `image:` refs, and
`deploy.sh` rsyncs only the stack directory — a `build:` context pointing at `../../app`
would not survive that rsync. So this stack pulls
`${DROID_TYCOON_IMAGE:-ghcr.io/jasparke/droid-tycoon:latest}`, built+pushed by CI
(see (a) below).

## (a) Build + push the image

CI does this: `.github/workflows/build-image.yml` builds `./app` and pushes
`:latest` + `:sha-<short>` to ghcr on every merge to `main` that touches `app/**`
(the sha tag is the digest-pin / rollback target — set `DROID_TYCOON_IMAGE` to it
to pin). Manual fallback, from the `droid-tycoon-tracker` repo root:

```bash
docker build -t ghcr.io/jasparke/droid-tycoon:latest ./app
docker push ghcr.io/jasparke/droid-tycoon:latest
```

## (b) Deploy

Copy (or symlink) this directory into the homelab repo, then:

```bash
cd ~/Projects/homelab/thelab
cp -r /path/to/droid-tycoon-tracker/stacks/droid-tycoon stacks/droid-tycoon   # first time only
cp pxe/.secrets.env stacks/droid-tycoon/.env   # or hand-merge the DROID_TYCOON_PG_PASSWORD / OIDC_CLIENT_SECRET values
bash stacks/deploy.sh droid-tycoon
```

`deploy.sh` rsyncs the stack dir to the VM (excluding `.env` and `postgres/` from
`--delete`), runs `docker compose up -d`, and curl-probes the `Host()` route.

## (c) First-run notes

- **Migrations run automatically** — the image's `CMD` runs
  `node drizzle/migrate.mjs && node build` on every container start (see
  `app/Dockerfile`), so no init container or manual migrate step is needed.
- **Seed the reference data once**, after the first successful deploy (droid/rebirth
  game data — distinct from user data, and not run by the image's `CMD`):

  ```bash
  docker compose exec app node drizzle/seed.mjs
  ```

  Safe to skip on redeploys (only needed the first time against a fresh `./postgres`).
- **OIDC provider must exist in Authentik first** (application slug `droid-tycoon`,
  redirect URI `https://droid-tycoon.pkfd.net/api/auth/oidc/callback`) — see the
  Authentik provider/application runbook
  (`docs/superpowers/handoffs/2026-07-17-authentik-provider-setup.md` in
  `droid-tycoon-tracker`). Without it, `/api/auth/oidc/start` fails OIDC discovery.

## (d) Homelab bookkeeping (paste into `~/Projects/homelab/thelab`)

### `apps.md` row

```markdown
| droid-tycoon | 🟢 live | droid-tycoon.pkfd.net (public via cloudflared) | Droid Tycoon rebirth tracker for friends; Authentik OIDC SSO, own Postgres |
```

(Match the existing table's column order/status glyphs — adjust `🟢 live` if the
convention differs, e.g. a "deploying" status until the first successful curl-probe.)

### `stacks/.env.example` block

```bash
# droid-tycoon/.env
DROID_TYCOON_PG_PASSWORD=changeme
OIDC_CLIENT_SECRET=changeme
```

### `stacks/glance/config/glance.yml` monitor entry

```yaml
- title: Droid Tycoon
  url: https://droid-tycoon.pkfd.net
  icon: di:svelte
```

(`svelte` is the closest match on [dashboard-icons](https://github.com/walkxcode/dashboard-icons)
— no droid-tycoon/Star-Wars-specific icon exists there.)

### `stacks/homarr/board.md` entry

```markdown
- **Droid Tycoon** — https://droid-tycoon.pkfd.net — rebirth tracker (Authentik SSO)
```

### `TASKS.md` deferrals

```markdown
- [ ] droid-tycoon: pin `DROID_TYCOON_IMAGE` to a digest/tag instead of `:latest` — CI
      now pushes a `:sha-<short>` tag per main merge to pin to.
- [ ] droid-tycoon: run `docker compose exec app node drizzle/seed.mjs` once after first
      deploy to load reference game data (not run automatically by the image).
- [ ] droid-tycoon: confirm the `./postgres` bind mount (vs. the named volumes the
      authentik/patchmon stacks use) is the desired convention going forward — deliberate
      choice here to keep DB state visible in the stack dir and covered by `deploy.sh`'s
      rsync `--delete` exclude list.
```
