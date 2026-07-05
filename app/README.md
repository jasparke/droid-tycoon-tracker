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
    INVITE_CODE=dev npm run dev

`db.ts` and the `db:*` scripts default to `postgres://dtt:dtt@localhost:5432/dtt`;
set `DATABASE_URL` to override. Registration needs `INVITE_CODE` (inline as above,
or in `app/.env`).

## Tests

- `npm run check` — svelte-check type check (no database).
- `npm run test:unit` — pure game-logic units in `src/lib/game` (no database).
- `npm run test:int` — service + helper tests in `src/lib/server`; needs the
  `dtt_test` database up (migrations are applied automatically).
- `npm run test:e2e` — Playwright smoke; builds the app and runs it against the
  `dtt` database. Needs the dev database up and browsers installed
  (`npx playwright install`).

## Production

See the [root README](../README.md) for the Docker Compose deployment.
