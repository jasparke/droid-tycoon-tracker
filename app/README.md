# Droid Tycoon tracker (app)

Multi-user web tracker for **Star Wars: Droid Tycoon** rebirths — SvelteKit +
Postgres. Replaces the frozen single-file prototype in `../prototype/`.

## Development

    npm install

Start the dev database from the repo root (Postgres with a `dtt` dev database
and a `dtt_test` integration database on `localhost:5432`):

    docker compose -f docker-compose.dev.yml up -d

Apply migrations, seed the game reference data, then run the dev server:

    npm run db:migrate
    npm run db:seed
    npm run dev

`db.ts` and the `db:*` scripts default to `postgres://dtt:dtt@localhost:5432/dtt`;
set `DATABASE_URL` to override.

### Auth: Authentik OIDC

Sign-in is Authentik OIDC SSO (see the root [README](../README.md#auth-authentik-oidc)
and
[`docs/superpowers/specs/2026-07-17-authentik-oidc-sso-design.md`](../docs/superpowers/specs/2026-07-17-authentik-oidc-sso-design.md))
— there's no local password login. Against real Authentik, set `OIDC_ISSUER_URL`,
`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, and `PUBLIC_BASE_URL` in
`app/.env` before `npm run dev`.

Without a real Authentik reachable, run the same auto-approving stub the e2e suite uses
(`e2e/support/fake-oidc-provider.mjs`, **test-only, never in prod**) in a second terminal:

    FAKE_OIDC_PORT=9099 node e2e/support/fake-oidc-provider.mjs

then point the dev server at it (e.g. in `app/.env`):

    PUBLIC_BASE_URL=http://localhost:5173
    OIDC_ISSUER_URL=http://localhost:9099
    OIDC_CLIENT_ID=test-client
    OIDC_CLIENT_SECRET=test-secret
    OIDC_REDIRECT_URI=http://localhost:5173/api/auth/oidc/callback
    OIDC_ALLOW_INSECURE=1

`OIDC_ALLOW_INSECURE` permits the plain-`http://localhost` issuer; it must never be set
outside local dev/e2e.

## Tests

- `npm run check` — svelte-check type check (no database).
- `npm run test:unit` — pure units in `src/lib/game` and `src/lib/client` (no database).
- `npm run test:int` — service + helper tests in `src/lib/server`; needs the
  `dtt_test` database up (migrations are applied automatically).
- `npm run test:e2e` — Playwright smoke; builds the app and runs it against the
  `dtt` database. Needs the dev database up and browsers installed
  (`npx playwright install`).

## Production

See the [root README](../README.md) for the Docker Compose deployment.
