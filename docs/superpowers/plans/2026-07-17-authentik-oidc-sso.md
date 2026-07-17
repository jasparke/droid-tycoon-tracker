# Authentik OIDC SSO (Part B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's homegrown username/password auth with Authentik-brokered OIDC "Sign in with Google", reusing the existing server-side session cookie/table so nothing downstream of `createSession` changes.

**Architecture:** The app stays a confidential OIDC client. Only the credential check changes: `/login` links to `GET /api/auth/oidc/start` (builds a PKCE + state + nonce authorize URL via `openid-client` v6 and 302s to Authentik), Authentik brokers Google, and `GET /api/auth/oidc/callback` exchanges the code, validates the id_token, upserts the user by stable OIDC `sub`, and mints the existing 30-day session cookie. `hooks.server.ts`, `locals.user` (`{ id, username }`), and every `/api` route are untouched. The password machinery (`register`, `login`, `pw_hash`, invite codes, `@node-rs/argon2`) is removed (greenfield — no prod password users).

**Tech Stack:** SvelteKit 2 + `@sveltejs/adapter-node`, Svelte 5, Drizzle ORM 0.45 / drizzle-kit 0.31, Postgres (`postgres` driver), `openid-client` v6.8.x (ESM-only, functional API), Vitest 4 (integration suite against real Postgres), Playwright (e2e). Node 22 (Docker).

## Global Constraints

- **`openid-client` v6.8.x, ESM-only.** Functional API confirmed against `/panva/openid-client/v6.8.4`: `discovery()` → `buildAuthorizationUrl()` → `authorizationCodeGrant()` → `tokens.claims()`. No v5 `Issuer`/`Client` classes. The app is already `"type": "module"`, so ESM-only is fine.
- **Confidential client auth is explicit:** `client.discovery(new URL(issuer), clientId, undefined, client.ClientSecretPost(secret), options?)`. The 4th arg selects the token-endpoint auth method and MUST match Authentik's provider "Client authentication" setting (`client_secret_post`).
- **HTTPS enforced by default.** For the http localhost e2e stub only, pass `{ execute: [client.allowInsecureRequests] }` as the 5th `discovery()` arg, gated behind env `OIDC_ALLOW_INSECURE === '1'`. Production never sets that flag.
- **Session layer is frozen.** Keep `createSession`, `validateSession`, `logout` in `src/lib/server/services/users.ts` verbatim. Keep the `sessions` table, `hooks.server.ts`, `src/app.d.ts` `SessionUser = { id, username }`, and the `session` cookie contract (`path:'/', httpOnly, sameSite:'lax', secure:!dev, expires`). Do not touch any `/api` route other than the auth ones named here.
- **Env contract (5 vars + 1 test flag):** `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `PUBLIC_BASE_URL` read server-side; `OIDC_ALLOW_INSECURE` (test only). Read `OIDC_*` via `$env/dynamic/private`; read `PUBLIC_BASE_URL` via `$env/dynamic/public` (SvelteKit routes `PUBLIC_`-prefixed vars to the public loader). **Invariant:** `OIDC_REDIRECT_URI === PUBLIC_BASE_URL + '/api/auth/oidc/callback'`. `PUBLIC_BASE_URL` is the trusted origin used to reconstruct the callback URL (decoupled from proxy `Host` headers behind cloudflared).
- **Fixed constants (from the approved spec):** production redirect URI `https://droid-tycoon.pkfd.net/api/auth/oidc/callback`; issuer `https://auth.pkfd.net/application/o/droid-tycoon/` (note trailing slash — required for correct `.well-known` discovery); scopes `openid email profile`; PKCE `S256`.
- **Repo has NO CI.** Every green claim must be reproduced locally: `cd app && npm run check && npm run test:unit && npm run test:int && npm run test:e2e`. `test:int` runs `src/lib/server` serially (`--no-file-parallelism`) against `dtt_test`; it needs a running Postgres.
- **Greenfield / destructive migration is authorized** (deploy on hold, no prod password users). Confirm with Jason once before applying the schema change (Task 1 gate).
- **Test DB reset (one-time, after Task 1):** the new migration adds `oidc_sub NOT NULL`; it only applies cleanly to an EMPTY `users` table. Before the first `test:int`/`test:e2e` run after Task 1, drop and rebuild the test schema (Task 1, Step 5).

---

## File Structure

**App code (`app/`):**
- `src/lib/server/schema.ts` — MODIFY `users`: `+oidcSub` (`oidc_sub text not null unique`), `+email` (`email text`), `−pwHash`.
- `drizzle/migrations/0001_*.sql` (+ `meta/_journal.json`, `meta/0001_snapshot.json`) — CREATE via `npm run db:generate`.
- `src/lib/server/services/users.ts` — `+findOrCreateOidcUser`; `−register`, `−login`, `−DUMMY_HASH`, `−@node-rs/argon2` import; keep the session trio verbatim.
- `src/lib/server/oidc.ts` — CREATE. Pure module wrapping `openid-client` (no SvelteKit virtuals). `buildOidcStart()`, `completeOidcCallback()`. Unit-testable with `vi.mock('openid-client')`.
- `src/routes/api/auth/oidc/start/+server.ts` — CREATE. Thin `GET` handler: env → `buildOidcStart` → set 3 short-lived cookies → 302.
- `src/routes/api/auth/oidc/callback/+server.ts` — CREATE. Thin `GET` handler: read cookies → `completeOidcCallback` → `findOrCreateOidcUser` → `createSession` → set session cookie, clear temp cookies → 302 to `/checklist`.
- `src/routes/api/auth/login/+server.ts` — DELETE.
- `src/routes/api/auth/register/+server.ts` — DELETE.
- `src/routes/api/auth/logout/+server.ts` — KEEP unchanged.
- `src/routes/login/+page.svelte` — REWRITE to a single "Sign in with Google" link.
- `src/routes/register/+page.svelte` — DELETE.
- `src/routes/+layout.server.ts` — MODIFY `PUBLIC` set: drop `/register`.
- `src/routes/+layout.svelte` — MODIFY line-33 comment (login-only; cosmetic).
- `src/lib/server/testing/db.ts` — `+createTestUser(db, name)` helper (wraps `findOrCreateOidcUser`).
- `src/lib/server/services/users.integration.test.ts` — REWRITE (drop password/register tests; add `findOrCreateOidcUser` + session tests).
- `src/lib/server/services/{counts,profiles,importer,plans}.integration.test.ts` — MODIFY: swap `register(...)` helper calls for `createTestUser(...)`.
- `src/lib/server/oidc.integration.test.ts` — CREATE (mock `openid-client`; assert start/callback glue).
- `package.json` — `+openid-client`, `+jose` (dev), `−@node-rs/argon2`.
- `e2e/support/fake-oidc-provider.mjs` — CREATE. Standalone `node:http` + `jose` RS256 IdP stub.
- `e2e/support/auth.ts` — CREATE. `signIn(page, ...)` helper replacing `registerWithProfile`.
- `e2e/oidc-login.spec.ts` — CREATE.
- `e2e/{smoke,checklist,search,droid-art}.spec.ts` — MODIFY: use the OIDC `signIn` helper.
- `playwright.config.ts` — MODIFY: two `webServer` entries (stub + app) + OIDC env.
- `app/.env.example`, `app/README.md`, `app/docker-compose.yml` — MODIFY env docs (`−INVITE_CODE`, `+OIDC_*`, `+PUBLIC_BASE_URL`).

**Homelab / ops artifacts (this repo, authored to `~/Projects/homelab/thelab` conventions):**
- `stacks/droid-tycoon/compose.yaml` — CREATE.
- `stacks/droid-tycoon/.env.example` — CREATE (placeholder inventory).
- `stacks/droid-tycoon/README.md` — CREATE (deploy steps + ready-to-paste homelab bookkeeping snippets).
- `docs/superpowers/handoffs/2026-07-17-authentik-provider-setup.md` — CREATE (Authentik UI click-steps + optional API script).

---

## Task 1: Schema migration — OIDC identity columns, drop password

**Gate:** Confirm with Jason that this is greenfield (no prod password users to migrate) before applying. This migration is destructive to any existing `users` rows.

**Files:**
- Modify: `app/src/lib/server/schema.ts:6-11`
- Create: `app/drizzle/migrations/0001_*.sql` (+ `meta/` updates) via `db:generate`

**Interfaces:**
- Produces: `users` columns `oidcSub` (`oidc_sub text not null unique`), `email` (`email text` nullable), `createdAt` unchanged; `pwHash` removed. `username` stays `text not null unique`.

- [ ] **Step 1: Edit the `users` table definition**

In `app/src/lib/server/schema.ts`, replace the `users` table (lines 6-11):

```ts
export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	oidcSub: text('oidc_sub').notNull().unique(),
	username: text('username').notNull().unique(),
	email: text('email'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
```

- [ ] **Step 2: Generate the migration**

Run: `cd app && npm run db:generate`
Expected: a new `drizzle/migrations/0001_<name>.sql` plus updated `meta/_journal.json` (idx 1) and `meta/0001_snapshot.json`. The SQL should be equivalent to:

```sql
ALTER TABLE "users" DROP COLUMN "pw_hash";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "oidc_sub" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_oidc_sub_unique" UNIQUE("oidc_sub");
```

If drizzle-kit prompts about column ordering or asks whether `oidc_sub` is a rename of `pw_hash`, answer that it is a NEW column (not a rename).

- [ ] **Step 3: Sanity-check the generated SQL**

Read the generated `0001_*.sql`. Confirm it drops `pw_hash`, adds `oidc_sub NOT NULL` + unique constraint, and adds nullable `email`. If drizzle emitted the `ADD COLUMN "oidc_sub"` before the unique constraint, that's fine.

- [ ] **Step 4: Verify `svelte-check` still passes**

Run: `cd app && npm run check`
Expected: 0 errors. (Type errors in `users.ts`/tests are expected until Task 2 — if `check` surfaces them now, note them; they resolve in Task 2. `check` covers `.svelte`/`.ts` in `src`; the service edits happen next task.)

- [ ] **Step 5: Rebuild the dev + test databases (destructive, greenfield)**

The migration only applies to an empty `users` table. Reset both DBs so migrate runs clean:

Run:
```bash
cd app
psql postgres://dtt:dtt@localhost:5432/dtt      -c 'drop schema public cascade; create schema public;'
psql postgres://dtt:dtt@localhost:5432/dtt_test -c 'drop schema public cascade; create schema public;'
DATABASE_URL=postgres://dtt:dtt@localhost:5432/dtt      node drizzle/migrate.mjs && DATABASE_URL=postgres://dtt:dtt@localhost:5432/dtt node drizzle/seed.mjs
DATABASE_URL=postgres://dtt:dtt@localhost:5432/dtt_test node drizzle/migrate.mjs
```
Expected: `migrations applied` printed for each; no errors. (Adjust connection URLs if the local Postgres differs.)

- [ ] **Step 6: Commit**

```bash
cd app && git add src/lib/server/schema.ts drizzle/migrations
git commit -m "feat(auth): users schema for OIDC — add oidc_sub+email, drop pw_hash"
```

---

## Task 2: `users.ts` service — `findOrCreateOidcUser`, remove password machinery

**Files:**
- Modify: `app/src/lib/server/services/users.ts`
- Modify: `app/src/lib/server/testing/db.ts` (add `createTestUser`)
- Rewrite: `app/src/lib/server/services/users.integration.test.ts`
- Modify: `app/src/lib/server/services/{counts,profiles,importer,plans}.integration.test.ts`
- Modify: `app/package.json` (drop `@node-rs/argon2`)

**Interfaces:**
- Produces: `findOrCreateOidcUser(db, { sub, email?, name? }) => Promise<{ id: number; username: string }>`. Keeps `createSession`, `validateSession`, `logout` verbatim.
- Produces: `createTestUser(db, name: string) => Promise<{ id: number; username: string }>` in `testing/db.ts`.
- Consumes (Task 1): `users` with `oidcSub`, `email`.

**Behaviour of `findOrCreateOidcUser`:**
- Look up by `oidc_sub`. If found: update `email` when the incoming value differs; return `{ id, username }` (username stays stable — see note).
- If not found: derive a base display name = `name ?? email-local-part ?? 'user'`, and insert with a unique username (append `-2`, `-3`, … on collision). On a concurrent `oidc_sub` unique violation, re-fetch and return the existing row.
- **Deviation flagged for Jason:** the spec's test list says "email/name update on re-login". This implementation updates `email` on re-login but keeps `username` STABLE after creation, to preserve the `username` unique invariant without collision churn. Confirm this is acceptable, or we add a separate mutable `display_name` column (schema change) if the display name must always track the IdP.

- [ ] **Step 1: Write the failing tests** (`users.integration.test.ts`, full rewrite)

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { testDb, resetUserZone } from '../testing/db';
import { findOrCreateOidcUser, createSession, validateSession, logout } from './users';
import { users, sessions } from '../schema';

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
beforeAll(async () => ({ db, sql } = await testDb()));
beforeEach(async () => resetUserZone(sql));

describe('findOrCreateOidcUser', () => {
	it('creates a new user from claims', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-1', email: 'a@example.com', name: 'Ada' });
		expect(u.id).toBeGreaterThan(0);
		expect(u.username).toBe('Ada');
		const row = await db.query.users.findFirst({ where: eq(users.oidcSub, 'goog-1') });
		expect(row?.email).toBe('a@example.com');
	});

	it('is idempotent for a returning sub (same id, no duplicate row)', async () => {
		const first = await findOrCreateOidcUser(db, { sub: 'goog-1', email: 'a@example.com', name: 'Ada' });
		const again = await findOrCreateOidcUser(db, { sub: 'goog-1', email: 'a@example.com', name: 'Ada' });
		expect(again.id).toBe(first.id);
		expect(await db.select().from(users)).toHaveLength(1);
	});

	it('updates email on re-login when it changed', async () => {
		await findOrCreateOidcUser(db, { sub: 'goog-1', email: 'old@example.com', name: 'Ada' });
		await findOrCreateOidcUser(db, { sub: 'goog-1', email: 'new@example.com', name: 'Ada' });
		const row = await db.query.users.findFirst({ where: eq(users.oidcSub, 'goog-1') });
		expect(row?.email).toBe('new@example.com');
	});

	it('dedupes username collisions across distinct subs', async () => {
		const a = await findOrCreateOidcUser(db, { sub: 'goog-1', name: 'Ada' });
		const b = await findOrCreateOidcUser(db, { sub: 'goog-2', name: 'Ada' });
		expect(a.username).toBe('Ada');
		expect(b.username).toBe('Ada-2');
	});

	it('derives a username from the email local part when name is absent', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-3', email: 'zed@example.com' });
		expect(u.username).toBe('zed');
	});

	it('falls back to "user" when neither name nor email is present', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-4' });
		expect(u.username).toBe('user');
	});
});

describe('sessions (unchanged behaviour, seeded via OIDC user)', () => {
	it('round-trips: createSession yields a token validateSession accepts', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-1', name: 'Ada' });
		const { token } = await createSession(db, u.id);
		expect(await validateSession(db, token)).toMatchObject({ id: u.id, username: 'Ada' });
	});

	it('logout invalidates the token', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-1', name: 'Ada' });
		const { token } = await createSession(db, u.id);
		await logout(db, token);
		expect(await validateSession(db, token)).toBeNull();
	});

	it('unknown token is null', async () => {
		expect(await validateSession(db, 'not-a-token')).toBeNull();
	});

	it('expired session is null and its row is deleted', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-1', name: 'Ada' });
		const { token } = await createSession(db, u.id);
		await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.token, sha256(token)));
		expect(await validateSession(db, token)).toBeNull();
		expect(await db.query.sessions.findFirst({ where: eq(sessions.token, sha256(token)) })).toBeUndefined();
	});

	it('stores only a hash of the token, never the raw value', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-1', name: 'Ada' });
		const { token } = await createSession(db, u.id);
		const rows = await db.select().from(sessions);
		expect(rows).toHaveLength(1);
		expect(rows[0].token).toBe(sha256(token));
		expect(rows.some((r) => r.token === token)).toBe(false);
	});
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd app && npm run test:int -- src/lib/server/services/users.integration.test.ts`
Expected: FAIL — `findOrCreateOidcUser` is not exported.

- [ ] **Step 3: Rewrite `users.ts`**

Replace the entire file with:

```ts
import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { users, sessions } from '../schema';

const SESSION_DAYS = 30;

// session tokens are stored hashed so a DB leak yields no usable credentials
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const PG_UNIQUE_VIOLATION = '23505';
const pgCode = (e: unknown) =>
	(e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;

// derive a friendly, non-empty display handle from the IdP claims
function baseUsername(input: { email?: string | null; name?: string | null }): string {
	const fromName = input.name?.trim();
	if (fromName) return fromName;
	const local = input.email?.split('@')[0]?.trim();
	if (local) return local;
	return 'user';
}

/**
 * Upsert a user keyed by the stable OIDC subject.
 * - returning sub: refresh email if changed; username stays stable (unique invariant).
 * - new sub: insert with a collision-deduped username.
 */
export async function findOrCreateOidcUser(
	db: Db,
	input: { sub: string; email?: string | null; name?: string | null }
): Promise<{ id: number; username: string }> {
	const existing = await db.query.users.findFirst({ where: eq(users.oidcSub, input.sub) });
	if (existing) {
		if (input.email != null && input.email !== existing.email) {
			await db.update(users).set({ email: input.email }).where(eq(users.id, existing.id));
		}
		return { id: existing.id, username: existing.username };
	}

	const base = baseUsername(input);
	for (let attempt = 0; attempt < 100; attempt++) {
		const username = attempt === 0 ? base : `${base}-${attempt + 1}`;
		try {
			const [u] = await db
				.insert(users)
				.values({ oidcSub: input.sub, username, email: input.email ?? null })
				.returning();
			return { id: u.id, username: u.username };
		} catch (e: unknown) {
			if (pgCode(e) !== PG_UNIQUE_VIOLATION) throw e;
			// A racing login may have created this sub concurrently — prefer the winner.
			const now = await db.query.users.findFirst({ where: eq(users.oidcSub, input.sub) });
			if (now) return { id: now.id, username: now.username };
			// else it was a username collision — loop and try the next suffix.
		}
	}
	throw new Error('findOrCreateOidcUser: exhausted username dedup attempts');
}

export async function createSession(db: Db, userId: number) {
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
	await db.insert(sessions).values({ token: hashToken(token), userId, expiresAt });
	return { token, expiresAt };
}

export async function validateSession(db: Db, token: string) {
	const digest = hashToken(token);
	const s = await db.query.sessions.findFirst({ where: eq(sessions.token, digest) });
	if (!s) return null;
	if (s.expiresAt < new Date()) {
		await db.delete(sessions).where(eq(sessions.token, digest));
		return null;
	}
	const u = await db.query.users.findFirst({ where: eq(users.id, s.userId) });
	return u ? { id: u.id, username: u.username } : null;
}

export async function logout(db: Db, token: string) {
	await db.delete(sessions).where(eq(sessions.token, hashToken(token)));
}
```

Note: `createSession` no longer sweeps expired rows (that lived in the old `login`). `validateSession` already deletes an expired row on access. If a global sweep is still wanted, it belongs in the callback, not here — leave it out to keep this task minimal (YAGNI).

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd app && npm run test:int -- src/lib/server/services/users.integration.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Add the `createTestUser` helper**

In `app/src/lib/server/testing/db.ts`, add an import and helper (place the import beside the existing ones, and the helper after `resetUserZone`):

```ts
import { findOrCreateOidcUser } from '../services/users';

// tests that only need "some user" create one keyed by a readable sub
export async function createTestUser(
	db: Awaited<ReturnType<typeof testDb>>['db'],
	name: string
) {
	return findOrCreateOidcUser(db, { sub: `test-${name}`, email: `${name}@test.local`, name });
}
```

- [ ] **Step 6: Repoint the four dependent integration tests**

In each of `counts`, `profiles`, `importer`, `plans` `.integration.test.ts`, replace the `register` import and its calls. Concretely:

- `counts.integration.test.ts:4,19,47` — change `import { register } from './users';` to `import { createTestUser } from '../testing/db';`, and replace
  `(await register(db, { username: 'aa', password: 'password123', inviteCode: 'x' }, 'x')).id`
  with `(await createTestUser(db, 'aa')).id`, and the `'bb'` one likewise.
- `importer.integration.test.ts:4,21` — same pattern with `'aa'`.
- `plans.integration.test.ts:4,16` — same pattern with `'aa'`.
- `profiles.integration.test.ts:3,13,14` — change the import; replace
  `alice = await register(db, { username: 'alice', password: 'password123', inviteCode: 'x' }, 'x');`
  with `alice = await createTestUser(db, 'alice');` and `bob` likewise.

(Any test asserting `.username` still holds: `createTestUser(db, 'alice')` returns `username: 'alice'`.)

- [ ] **Step 7: Drop the `@node-rs/argon2` dependency**

Run: `cd app && npm uninstall @node-rs/argon2`
Expected: it leaves `dependencies` as `drizzle-orm`, `postgres`, and the two `@fontsource/*`. (Confirm nothing else imports it: `grep -rn "@node-rs/argon2" src` returns nothing.)

- [ ] **Step 8: Run the full integration suite**

Run: `cd app && npm run test:int`
Expected: PASS. (`users`, `counts`, `profiles`, `importer`, `plans`, `reference`, `respond` — all green. `respond.test.ts` is unaffected.)

- [ ] **Step 9: Commit**

```bash
cd app && git add src/lib/server/services/users.ts src/lib/server/testing/db.ts \
  src/lib/server/services/*.integration.test.ts package.json package-lock.json
git commit -m "feat(auth): findOrCreateOidcUser; drop register/login/argon2; repoint test helpers"
```

---

## Task 3: `oidc.ts` — `openid-client` wrapper (unit-testable, no SvelteKit virtuals)

**Files:**
- Create: `app/src/lib/server/oidc.ts`
- Create: `app/src/lib/server/oidc.integration.test.ts`
- Modify: `app/package.json` (add `openid-client`)

**Interfaces:**
- Produces:
  - `type OidcConfig = { issuerUrl: string; clientId: string; clientSecret: string; redirectUri: string; allowInsecure?: boolean }`
  - `type OidcStart = { authorizationUrl: string; state: string; nonce: string; codeVerifier: string }`
  - `type OidcClaims = { sub: string; email: string | null; name: string | null }`
  - `buildOidcStart(cfg: OidcConfig) => Promise<OidcStart>`
  - `completeOidcCallback(cfg: OidcConfig, currentUrl: URL, checks: { state: string; nonce: string; codeVerifier: string }) => Promise<OidcClaims>`
- Consumes: `openid-client` v6 functional API.

- [ ] **Step 1: Add the dependency**

Run: `cd app && npm install openid-client@^6.8.4`
Expected: added to `dependencies`.

- [ ] **Step 2: Write the failing tests** (`oidc.integration.test.ts`)

This file mocks `openid-client`, so it needs no DB and no network. It runs under `test:int` (it lives in `src/lib/server`) but only exercises our glue.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// hoisted mock of the functional openid-client API
const m = vi.hoisted(() => ({
	discovery: vi.fn(),
	randomPKCECodeVerifier: vi.fn(() => 'verifier-xyz'),
	calculatePKCECodeChallenge: vi.fn(async () => 'challenge-xyz'),
	randomState: vi.fn(() => 'state-abc'),
	randomNonce: vi.fn(() => 'nonce-def'),
	buildAuthorizationUrl: vi.fn(),
	authorizationCodeGrant: vi.fn(),
	allowInsecureRequests: vi.fn(),
	ClientSecretPost: vi.fn((s: string) => ({ __auth: 'post', s }))
}));
vi.mock('openid-client', () => m);

import { buildOidcStart, completeOidcCallback } from './oidc';

const cfg = {
	issuerUrl: 'https://idp.test/app/o/x/',
	clientId: 'cid',
	clientSecret: 'secret',
	redirectUri: 'https://app.test/api/auth/oidc/callback'
};

beforeEach(() => vi.clearAllMocks());

describe('buildOidcStart', () => {
	it('discovers, builds a PKCE+state+nonce authorize URL, and returns the checks', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.buildAuthorizationUrl.mockReturnValue(new URL('https://idp.test/authorize?x=1'));

		const out = await buildOidcStart(cfg);

		expect(m.discovery).toHaveBeenCalledWith(
			new URL(cfg.issuerUrl), cfg.clientId, undefined, { __auth: 'post', s: 'secret' }, undefined
		);
		expect(m.buildAuthorizationUrl).toHaveBeenCalledWith(
			{ id: 'config' },
			{
				redirect_uri: cfg.redirectUri,
				scope: 'openid email profile',
				code_challenge: 'challenge-xyz',
				code_challenge_method: 'S256',
				state: 'state-abc',
				nonce: 'nonce-def'
			}
		);
		expect(out).toEqual({
			authorizationUrl: 'https://idp.test/authorize?x=1',
			state: 'state-abc',
			nonce: 'nonce-def',
			codeVerifier: 'verifier-xyz'
		});
	});

	it('passes allowInsecureRequests through discovery options when allowInsecure is set', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.buildAuthorizationUrl.mockReturnValue(new URL('https://idp.test/authorize'));
		await buildOidcStart({ ...cfg, allowInsecure: true });
		expect(m.discovery).toHaveBeenCalledWith(
			new URL(cfg.issuerUrl), cfg.clientId, undefined, { __auth: 'post', s: 'secret' },
			{ execute: [m.allowInsecureRequests] }
		);
	});
});

describe('completeOidcCallback', () => {
	it('exchanges the code with the stored checks and returns normalized claims', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.authorizationCodeGrant.mockResolvedValue({
			claims: () => ({ sub: 'goog-1', email: 'a@example.com', name: 'Ada', preferred_username: 'ada' })
		});
		const currentUrl = new URL('https://app.test/api/auth/oidc/callback?code=c&state=state-abc');

		const claims = await completeOidcCallback(cfg, currentUrl, {
			state: 'state-abc', nonce: 'nonce-def', codeVerifier: 'verifier-xyz'
		});

		expect(m.authorizationCodeGrant).toHaveBeenCalledWith(
			{ id: 'config' }, currentUrl,
			{ pkceCodeVerifier: 'verifier-xyz', expectedState: 'state-abc', expectedNonce: 'nonce-def', idTokenExpected: true }
		);
		expect(claims).toEqual({ sub: 'goog-1', email: 'a@example.com', name: 'ada' });
	});

	it('prefers preferred_username, falls back to name, then null; email null when absent', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.authorizationCodeGrant.mockResolvedValue({ claims: () => ({ sub: 'goog-2' }) });
		const claims = await completeOidcCallback(cfg, new URL('https://app.test/cb?code=c'), {
			state: 's', nonce: 'n', codeVerifier: 'v'
		});
		expect(claims).toEqual({ sub: 'goog-2', email: null, name: null });
	});

	it('throws when the id_token has no claims', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.authorizationCodeGrant.mockResolvedValue({ claims: () => undefined });
		await expect(
			completeOidcCallback(cfg, new URL('https://app.test/cb?code=c'), { state: 's', nonce: 'n', codeVerifier: 'v' })
		).rejects.toThrow(/claims/i);
	});
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `cd app && npm run test:int -- src/lib/server/oidc.integration.test.ts`
Expected: FAIL — `./oidc` module not found.

- [ ] **Step 4: Implement `oidc.ts`**

```ts
import * as client from 'openid-client';

export type OidcConfig = {
	issuerUrl: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	/** test-only: allow http (localhost stub). Never set in production. */
	allowInsecure?: boolean;
};

export type OidcStart = {
	authorizationUrl: string;
	state: string;
	nonce: string;
	codeVerifier: string;
};

export type OidcClaims = { sub: string; email: string | null; name: string | null };

const SCOPE = 'openid email profile';

async function discover(cfg: OidcConfig): Promise<client.Configuration> {
	return client.discovery(
		new URL(cfg.issuerUrl),
		cfg.clientId,
		undefined,
		client.ClientSecretPost(cfg.clientSecret),
		cfg.allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined
	);
}

/** Discover + build a PKCE + state + nonce authorize URL. Caller stashes the checks in cookies. */
export async function buildOidcStart(cfg: OidcConfig): Promise<OidcStart> {
	const config = await discover(cfg);
	const codeVerifier = client.randomPKCECodeVerifier();
	const code_challenge = await client.calculatePKCECodeChallenge(codeVerifier);
	const state = client.randomState();
	const nonce = client.randomNonce();
	const url = client.buildAuthorizationUrl(config, {
		redirect_uri: cfg.redirectUri,
		scope: SCOPE,
		code_challenge,
		code_challenge_method: 'S256',
		state,
		nonce
	});
	return { authorizationUrl: url.href, state, nonce, codeVerifier };
}

/** Exchange the code at `currentUrl`, validating state/nonce/PKCE, and return normalized id_token claims. */
export async function completeOidcCallback(
	cfg: OidcConfig,
	currentUrl: URL,
	checks: { state: string; nonce: string; codeVerifier: string }
): Promise<OidcClaims> {
	const config = await discover(cfg);
	const tokens = await client.authorizationCodeGrant(config, currentUrl, {
		pkceCodeVerifier: checks.codeVerifier,
		expectedState: checks.state,
		expectedNonce: checks.nonce,
		idTokenExpected: true
	});
	const claims = tokens.claims();
	if (!claims) throw new Error('OIDC callback: id_token had no claims');
	const name = (claims.preferred_username as string | undefined) ?? (claims.name as string | undefined) ?? null;
	const email = (claims.email as string | undefined) ?? null;
	return { sub: claims.sub, email, name };
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `cd app && npm run test:int -- src/lib/server/oidc.integration.test.ts`
Expected: PASS. Also run `npm run check` — expected 0 errors.

- [ ] **Step 6: Commit**

```bash
cd app && git add src/lib/server/oidc.ts src/lib/server/oidc.integration.test.ts package.json package-lock.json
git commit -m "feat(auth): openid-client v6 wrapper (buildOidcStart/completeOidcCallback)"
```

---

## Task 4: OIDC routes — `start` + `callback` handlers

**Files:**
- Create: `app/src/routes/api/auth/oidc/start/+server.ts`
- Create: `app/src/routes/api/auth/oidc/callback/+server.ts`

**Interfaces:**
- Consumes: `buildOidcStart`, `completeOidcCallback` (Task 3); `findOrCreateOidcUser`, `createSession` (Task 2); env (`$env/dynamic/private` OIDC_*, `$env/dynamic/public` PUBLIC_BASE_URL).
- Cookie contract: three short-lived httpOnly cookies `oidc_state`, `oidc_nonce`, `oidc_verifier` (`path:'/', sameSite:'lax', secure:!dev, maxAge:600`), cleared in the callback. `sameSite:'lax'` is required so the cookies ride the top-level GET redirect back from Authentik.

These handlers are covered by the e2e (Task 6), following the repo convention that `+server.ts` route glue is exercised end-to-end rather than unit-tested (they import SvelteKit virtuals unavailable to Vitest).

- [ ] **Step 1: Write `start/+server.ts`**

```ts
import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { buildOidcStart, type OidcConfig } from '$lib/server/oidc';

function oidcConfig(): OidcConfig {
	return {
		issuerUrl: env.OIDC_ISSUER_URL ?? '',
		clientId: env.OIDC_CLIENT_ID ?? '',
		clientSecret: env.OIDC_CLIENT_SECRET ?? '',
		redirectUri: env.OIDC_REDIRECT_URI ?? '',
		allowInsecure: env.OIDC_ALLOW_INSECURE === '1'
	};
}

const tempCookie = { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: 600 } as const;

export const GET: RequestHandler = async ({ cookies }) => {
	const { authorizationUrl, state, nonce, codeVerifier } = await buildOidcStart(oidcConfig());
	cookies.set('oidc_state', state, tempCookie);
	cookies.set('oidc_nonce', nonce, tempCookie);
	cookies.set('oidc_verifier', codeVerifier, tempCookie);
	redirect(302, authorizationUrl);
};
```

- [ ] **Step 2: Write `callback/+server.ts`**

```ts
import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { completeOidcCallback, type OidcConfig } from '$lib/server/oidc';
import { findOrCreateOidcUser, createSession } from '$lib/server/services/users';

function oidcConfig(): OidcConfig {
	return {
		issuerUrl: env.OIDC_ISSUER_URL ?? '',
		clientId: env.OIDC_CLIENT_ID ?? '',
		clientSecret: env.OIDC_CLIENT_SECRET ?? '',
		redirectUri: env.OIDC_REDIRECT_URI ?? '',
		allowInsecure: env.OIDC_ALLOW_INSECURE === '1'
	};
}

const clearTemp = { path: '/' };

export const GET: RequestHandler = async ({ url, cookies }) => {
	const state = cookies.get('oidc_state');
	const nonce = cookies.get('oidc_nonce');
	const codeVerifier = cookies.get('oidc_verifier');
	cookies.delete('oidc_state', clearTemp);
	cookies.delete('oidc_nonce', clearTemp);
	cookies.delete('oidc_verifier', clearTemp);

	if (!state || !nonce || !codeVerifier) redirect(303, '/login?error=oidc_state');

	// Reconstruct the callback URL from the trusted public origin (not proxy Host headers),
	// keeping the incoming query (code, state). Its origin+path must equal OIDC_REDIRECT_URI.
	const base = pub.PUBLIC_BASE_URL ?? url.origin;
	const currentUrl = new URL(url.pathname + url.search, base);

	let claims;
	try {
		claims = await completeOidcCallback(oidcConfig(), currentUrl, { state, nonce, codeVerifier });
	} catch {
		redirect(303, '/login?error=oidc_exchange');
	}

	const user = await findOrCreateOidcUser(db, claims);
	const { token, expiresAt } = await createSession(db, user.id);
	cookies.set('session', token, {
		path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, expires: expiresAt
	});
	redirect(303, '/checklist');
};
```

Note: SvelteKit's `redirect()` throws a `Redirect` control object. The `try/catch` wraps ONLY `completeOidcCallback`; the redirect calls sit outside it, so a failed exchange redirects to `/login?error=…` while a successful path falls through to the session mint. (`claims` is definitely assigned after the try because the catch branch always throws via `redirect`.)

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run check`
Expected: 0 errors. If `check` flags `claims` as "used before assigned", change the catch to `catch { redirect(303, '/login?error=oidc_exchange'); }` (already the case) — TS understands `redirect` returns `never`, so `claims` is assigned on all reachable paths. If it still complains, annotate `let claims: Awaited<ReturnType<typeof completeOidcCallback>>;`.

- [ ] **Step 4: Commit**

```bash
cd app && git add src/routes/api/auth/oidc
git commit -m "feat(auth): OIDC start + callback routes"
```

---

## Task 5: Remove password UI/routes, rewire `/login`, tidy layout guard

**Files:**
- Delete: `app/src/routes/api/auth/login/+server.ts`, `app/src/routes/api/auth/register/+server.ts`, `app/src/routes/register/+page.svelte`
- Modify: `app/src/routes/login/+page.svelte`, `app/src/routes/+layout.server.ts`, `app/src/routes/+layout.svelte`

- [ ] **Step 1: Delete the password routes and register page**

```bash
cd app && git rm src/routes/api/auth/login/+server.ts \
  src/routes/api/auth/register/+server.ts \
  src/routes/register/+page.svelte
```

- [ ] **Step 2: Rewrite `login/+page.svelte`**

```svelte
<script lang="ts">
	// SSO-only: a single link that starts the Authentik OIDC flow.
	// A full navigation (not fetch) so the browser follows the 302 to the IdP.
</script>

<h1>Log in</h1>
<p>Sign in with your Google account to sync your progress.</p>
<a class="sso" href="/api/auth/oidc/start" data-testid="sso-login">Sign in with Google</a>

<style>
	.sso {
		display: inline-block;
		margin-top: 1rem;
		padding: 0.6rem 1.1rem;
		border: 1px solid currentColor;
		border-radius: 6px;
		text-decoration: none;
		font: inherit;
	}
</style>
```

- [ ] **Step 3: Drop `/register` from the public-route guard**

In `app/src/routes/+layout.server.ts:8`, change:

```ts
const PUBLIC = new Set(['/login', '/register']);
```
to
```ts
const PUBLIC = new Set(['/login']);
```

- [ ] **Step 4: Tidy the layout comment**

In `app/src/routes/+layout.svelte` around line 33, update the comment that references "login/register" to say "login" only. (Cosmetic; find the `logged-out pages (login/register)` comment and drop `/register`.)

- [ ] **Step 5: Typecheck + unit + integration**

Run: `cd app && npm run check && npm run test:unit && npm run test:int`
Expected: all green. (No code should still import from the deleted routes; `grep -rn "api/auth/login\|api/auth/register\|/register" src` should only match unrelated strings, if any.)

- [ ] **Step 6: Commit**

```bash
cd app && git add -A src/routes
git commit -m "feat(auth): SSO-only login page; remove register + password routes; guard cleanup"
```

---

## Task 6: e2e against a stubbed OIDC provider; migrate existing specs

**Files:**
- Create: `app/e2e/support/fake-oidc-provider.mjs`
- Create: `app/e2e/support/auth.ts`
- Create: `app/e2e/oidc-login.spec.ts`
- Modify: `app/playwright.config.ts`
- Modify: `app/e2e/{smoke,checklist,search,droid-art}.spec.ts`
- Modify: `app/package.json` (add `jose` dev)

**Interfaces:**
- Produces: `signIn(page) => Promise<void>` and `signInWithProfile(page) => Promise<void>` in `e2e/support/auth.ts`. Each `signIn` yields a BRAND-NEW app user (the stub mints a fresh `sub` per authorization), matching the old "fresh user per test" behaviour.
- The fake IdP listens on `http://localhost:9099`, serves discovery + JWKS + auto-approving `/authorize` + `/token` (RS256 id_token via `jose`).

- [ ] **Step 1: Add `jose` (dev) for RS256 signing in the stub**

Run: `cd app && npm install -D jose`
Expected: added to `devDependencies`. (`jose` is already a transitive dep of `openid-client`; the explicit devDep makes the stub's import first-class.)

- [ ] **Step 2: Write the fake OIDC provider**

`app/e2e/support/fake-oidc-provider.mjs`:

```js
// Minimal auto-approving OIDC provider for e2e. NOT for production.
// Serves discovery + JWKS + /authorize (immediate redirect) + /token (RS256 id_token).
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const PORT = Number(process.env.FAKE_OIDC_PORT ?? 9099);
const ISSUER = process.env.FAKE_OIDC_ISSUER ?? `http://localhost:${PORT}`;
const CLIENT_ID = process.env.FAKE_OIDC_CLIENT_ID ?? 'test-client';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };

// code -> { nonce, sub, email, name } stashed at /authorize, consumed at /token
const codes = new Map();

const send = (res, status, body, type = 'application/json') => {
	res.writeHead(status, { 'content-type': type });
	res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const server = createServer(async (req, res) => {
	const url = new URL(req.url, ISSUER);

	if (url.pathname === '/.well-known/openid-configuration') {
		return send(res, 200, {
			issuer: ISSUER,
			authorization_endpoint: `${ISSUER}/authorize`,
			token_endpoint: `${ISSUER}/token`,
			jwks_uri: `${ISSUER}/jwks`,
			response_types_supported: ['code'],
			subject_types_supported: ['public'],
			id_token_signing_alg_values_supported: ['RS256'],
			code_challenge_methods_supported: ['S256'],
			scopes_supported: ['openid', 'email', 'profile'],
			grant_types_supported: ['authorization_code']
		});
	}

	if (url.pathname === '/jwks') return send(res, 200, { keys: [jwk] });

	if (url.pathname === '/authorize') {
		// Auto-approve: mint a fresh identity and redirect straight back with a code.
		const redirectUri = url.searchParams.get('redirect_uri');
		const state = url.searchParams.get('state');
		const nonce = url.searchParams.get('nonce');
		const code = randomUUID();
		const n = codes.size + 1;
		codes.set(code, {
			nonce,
			sub: `stub-${randomUUID()}`,
			email: `friend${n}@example.com`,
			name: `Friend ${n}`,
			preferred_username: `friend${n}`
		});
		const back = new URL(redirectUri);
		back.searchParams.set('code', code);
		if (state) back.searchParams.set('state', state);
		res.writeHead(302, { location: back.href });
		return res.end();
	}

	if (url.pathname === '/token' && req.method === 'POST') {
		let raw = '';
		for await (const chunk of req) raw += chunk;
		const form = new URLSearchParams(raw);
		const rec = codes.get(form.get('code'));
		if (!rec) return send(res, 400, { error: 'invalid_grant' });
		codes.delete(form.get('code'));
		const now = Math.floor(Date.now() / 1000);
		const idToken = await new SignJWT({
			email: rec.email,
			name: rec.name,
			preferred_username: rec.preferred_username,
			nonce: rec.nonce
		})
			.setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
			.setIssuer(ISSUER)
			.setSubject(rec.sub)
			.setAudience(CLIENT_ID)
			.setIssuedAt(now)
			.setExpirationTime(now + 300)
			.sign(privateKey);
		return send(res, 200, {
			access_token: randomUUID(),
			token_type: 'Bearer',
			expires_in: 300,
			id_token: idToken,
			scope: 'openid email profile'
		});
	}

	return send(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => console.log(`fake-oidc listening on ${ISSUER}`));
```

- [ ] **Step 3: Write the e2e auth helper**

`app/e2e/support/auth.ts`:

```ts
import { expect, type Page } from '@playwright/test';

/** Drive the SSO flow end-to-end; the stub mints a fresh user each call. */
export async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	// full navigation follows: /api/auth/oidc/start -> stub /authorize -> callback -> /checklist
	await page.getByTestId('sso-login').click();
	await expect(page).toHaveURL(/checklist/);
}

/** Sign in and create a default profile named "main" (mirrors the old registerWithProfile). */
export async function signInWithProfile(page: Page): Promise<void> {
	await signIn(page);
	await page.request.post('/api/profiles', { data: { name: 'main' } });
	await page.reload();
}
```

- [ ] **Step 4: Update `playwright.config.ts` — two web servers + OIDC env**

```ts
import { defineConfig } from '@playwright/test';

// e2e runs against the throwaway test database, never the developer's dev db
const DATABASE_URL = 'postgres://dtt:dtt@localhost:5432/dtt_test';
const APP_ORIGIN = 'http://localhost:4173';
const IDP_ORIGIN = 'http://localhost:9099';

export default defineConfig({
	testDir: 'e2e',
	use: { baseURL: APP_ORIGIN },
	webServer: [
		{
			command: 'node e2e/support/fake-oidc-provider.mjs',
			port: 9099,
			env: { FAKE_OIDC_PORT: '9099', FAKE_OIDC_ISSUER: IDP_ORIGIN, FAKE_OIDC_CLIENT_ID: 'test-client' }
		},
		{
			// build, then apply migrations and the full reference seed to dtt_test
			// before the server accepts connections
			command: 'npm run build && node drizzle/migrate.mjs && node drizzle/seed.mjs && node build',
			port: 4173,
			env: {
				PORT: '4173',
				DATABASE_URL,
				ORIGIN: APP_ORIGIN,
				PUBLIC_BASE_URL: APP_ORIGIN,
				OIDC_ISSUER_URL: IDP_ORIGIN,
				OIDC_CLIENT_ID: 'test-client',
				OIDC_CLIENT_SECRET: 'test-secret',
				OIDC_REDIRECT_URI: `${APP_ORIGIN}/api/auth/oidc/callback`,
				OIDC_ALLOW_INSECURE: '1'
			}
		}
	]
});
```

- [ ] **Step 5: Write `oidc-login.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { signIn } from './support/auth';

test('SSO login: /login button drives the full OIDC flow into the app', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByTestId('sso-login')).toBeVisible();
	await signIn(page);
	await expect(page).toHaveURL(/checklist/);
	// logging in created a session — the profile menu (authed shell) is present
	await expect(page.locator('.pcard')).toBeVisible();
});

test('unauthenticated access to a gated page redirects to /login', async ({ page }) => {
	await page.goto('/checklist');
	await expect(page).toHaveURL(/login/);
	await expect(page.getByTestId('sso-login')).toBeVisible();
});
```

- [ ] **Step 6: Migrate the existing specs to `signIn`**

- `smoke.spec.ts`: replace the register block (lines 4-10) with a `signIn(page)` call:
  ```ts
  import { test, expect } from '@playwright/test';
  import { signIn } from './support/auth';

  test('sign in → tap a chip → reload → persisted', async ({ page }) => {
  	await signIn(page);
  	await page.request.post('/api/profiles', { data: { name: 'main' } });
  	await page.reload();
  	// ...unchanged from the first `.row` locator onward
  ```
- `checklist.spec.ts`: delete the local `registerWithProfile` (lines 3-12); add `import { signInWithProfile } from './support/auth';` and replace every `await registerWithProfile(page, \`...\`)` with `await signInWithProfile(page)`. For the "read-only profile" test, the two logins (owner then viewer) each get a fresh stub user automatically. The current assertion matches the owner profile by `new RegExp(\`${owner}/main\`)`; the stub username is now `Friend N`, so capture the owner's display name after sign-in instead of using a literal:
  ```ts
  await signInWithProfile(page);
  const owner = (await page.locator('.pcard').innerText()).trim(); // owner's display name from the profile card
  // ...log out; sign in as viewer; then select the profile whose label matches `${owner}/main`.
  ```
  If reading the exact card text is fiddly, prefer asserting the test's real intent — the READ-ONLY banner is visible and controls are disabled — without matching the owner's exact name.
- `search.spec.ts` and `droid-art.spec.ts`: read each first; they follow the same `registerWithProfile` pattern. Replace with `signInWithProfile`/`signIn` the same way.

- [ ] **Step 7: Run the e2e suite**

Run: `cd app && npm run test:e2e`
Expected: PASS — `oidc-login`, `smoke`, `checklist`, `search`, `droid-art`. Playwright starts both web servers. If discovery fails with an https error, confirm `OIDC_ALLOW_INSECURE=1` is set in the app webServer env.

- [ ] **Step 8: Commit**

```bash
cd app && git add e2e playwright.config.ts package.json package-lock.json
git commit -m "test(auth): stubbed-OIDC e2e; migrate existing specs to SSO sign-in"
```

---

## Task 7: Homelab compose stack + env docs

**Files:**
- Create: `stacks/droid-tycoon/compose.yaml`
- Create: `stacks/droid-tycoon/.env.example`
- Create: `stacks/droid-tycoon/README.md`
- Modify: `app/.env.example`, `app/README.md`, `app/docker-compose.yml`

**Decision to confirm with Jason (deploy is his domain):** homelab stacks use pre-built `image:` refs and `deploy.sh` rsyncs only the stack dir — a `build:` context pointing at `../../app` would not survive that rsync. So the compose uses `image: ${DROID_TYCOON_IMAGE:-ghcr.io/jasparke/droid-tycoon:latest}`, and the image is built+pushed from this repo (manual, no CI). The stack is authored here (versioned with the app); Jason copies it into `~/Projects/homelab/thelab/stacks/droid-tycoon/` (or points Komodo at this path) at deploy time. Bookkeeping snippets for the homelab repo are in `stacks/droid-tycoon/README.md`.

- [ ] **Step 1: Write `stacks/droid-tycoon/compose.yaml`**

Follows the authentik stack pattern (own Postgres, inline `${VAR:?}` secrets, `proxy` net + `traefik.docker.network` disambiguation because the app is on two networks). Migrations run on container start (`node drizzle/migrate.mjs && node build`, per the app Dockerfile CMD) — no init container.

```yaml
name: droid-tycoon

# Droid Tycoon rebirth tracker — SvelteKit + Postgres. Public web-app class
# (cloudflared -> Traefik at droid-tycoon.pkfd.net). Auth: Authentik OIDC
# ("Sign in with Google"), see the droid-tycoon-tracker repo spec
# docs/superpowers/specs/2026-07-17-authentik-oidc-sso-design.md.
#
# Image is built + pushed from the droid-tycoon-tracker repo (app/Dockerfile);
# no CI yet, so publish manually (see README.md). The app runs
# `node drizzle/migrate.mjs` on start, then serves adapter-node on :3000.
#
# Secrets (pxe/.secrets.env -> .env at deploy):
#   DROID_TYCOON_PG_PASSWORD, OIDC_CLIENT_SECRET
# OIDC provider/client are configured in Authentik (slug droid-tycoon).

services:
  app:
    image: ${DROID_TYCOON_IMAGE:-ghcr.io/jasparke/droid-tycoon:latest}
    container_name: droid-tycoon
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      TZ: ${TZ:-America/Vancouver}
      DATABASE_URL: postgres://droid:${DROID_TYCOON_PG_PASSWORD:?set in .env (from pxe/.secrets.env)}@db:5432/droid_tycoon
      ORIGIN: https://droid-tycoon.pkfd.net
      PUBLIC_BASE_URL: https://droid-tycoon.pkfd.net
      OIDC_ISSUER_URL: https://auth.pkfd.net/application/o/droid-tycoon/
      OIDC_CLIENT_ID: droid-tycoon
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:?set in .env (from pxe/.secrets.env)}
      OIDC_REDIRECT_URI: https://droid-tycoon.pkfd.net/api/auth/oidc/callback
    networks:
      - droid-tycoon-internal
      - proxy
    labels:
      traefik.enable: "true"
      traefik.http.routers.droid-tycoon.rule: Host(`droid-tycoon.pkfd.net`)
      traefik.http.routers.droid-tycoon.entrypoints: websecure
      traefik.http.services.droid-tycoon.loadbalancer.server.port: "3000"
      traefik.docker.network: proxy

  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: droid_tycoon
      POSTGRES_USER: droid
      POSTGRES_PASSWORD: ${DROID_TYCOON_PG_PASSWORD:?set in .env (from pxe/.secrets.env)}
    volumes:
      - ./postgres:/var/lib/postgresql/data
    networks:
      - droid-tycoon-internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -d droid_tycoon -U droid"]
      interval: 5s
      timeout: 5s
      retries: 10

networks:
  droid-tycoon-internal:
    driver: bridge
  proxy:
    external: true
```

Note: this uses a **`./postgres` bind mount** (as the spec requested) rather than a named volume; `deploy.sh` excludes `postgres/` from both rsync and `--delete`, so DB state survives redeploys. (The existing authentik/patchmon stacks use named volumes — flag to Jason that this deliberately differs to keep DB state visible in the stack dir and protected by the exclude list.)

- [ ] **Step 2: Write `stacks/droid-tycoon/.env.example`**

```bash
# droid-tycoon/.env — real values live in pxe/.secrets.env, copied here at deploy.
# See stacks/.env.example in the homelab repo for the placeholder inventory.
DROID_TYCOON_PG_PASSWORD=changeme
OIDC_CLIENT_SECRET=changeme
# Optional image override (defaults to ghcr.io/jasparke/droid-tycoon:latest):
# DROID_TYCOON_IMAGE=ghcr.io/jasparke/droid-tycoon:latest
```

- [ ] **Step 3: Write `stacks/droid-tycoon/README.md`**

Include: (a) how to build+push the image from this repo; (b) deploy via homelab `deploy.sh droid-tycoon`; (c) first-run notes (migrations auto-run; the reference seed — decide whether to run `db:seed` once via `docker compose exec app node drizzle/seed.mjs`); (d) **ready-to-paste homelab bookkeeping snippets** for the separate `~/Projects/homelab/thelab` repo:
  - `apps.md` row (status, where, one-line why).
  - `stacks/.env.example` block:
    ```bash
    # droid-tycoon/.env
    DROID_TYCOON_PG_PASSWORD=changeme
    OIDC_CLIENT_SECRET=changeme
    ```
  - `stacks/glance/config/glance.yml` monitor entry (`di:` icon slug — verify on dashboard-icons) + `stacks/homarr/board.md` entry.
  - `TASKS.md` deferrals (image digest-pin; run `db:seed` once; confirm `./postgres` bind vs named volume).

- [ ] **Step 4: Update the app env docs**

- `app/.env.example`: remove `INVITE_CODE`; add `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `PUBLIC_BASE_URL` (with local-dev + prod example values and the `OIDC_REDIRECT_URI === PUBLIC_BASE_URL + '/api/auth/oidc/callback'` invariant noted). Keep `POSTGRES_PASSWORD`/`ORIGIN`. Read the file first to preserve its format.
- `app/README.md`: update the `cp .env.example .env` line (~line 9) to reference the OIDC vars instead of `INVITE_CODE`; add a short "Auth: Authentik OIDC" paragraph pointing at the spec.
- `app/docker-compose.yml`: remove any `INVITE_CODE` env; add the `OIDC_*` + `PUBLIC_BASE_URL` env with `${VAR:?}` guards (this is the app's own dev/prod compose, distinct from the homelab stack). Read the file first to place edits precisely.

- [ ] **Step 5: Verify the app still builds with the new env contract**

Run: `cd app && npm run build`
Expected: build succeeds (env is read at runtime via `$env/dynamic/*`, so build doesn't require the vars set).

- [ ] **Step 6: Commit**

```bash
cd /Users/jason/Projects/DroidTycoon/droid-tycoon-tracker/.claude/worktrees/oidc-sso-partb
git add stacks/droid-tycoon app/.env.example app/README.md app/docker-compose.yml
git commit -m "chore(deploy): droid-tycoon homelab stack + OIDC env contract docs"
```

---

## Task 8: Authentik provider/application/enrollment/group (console — API or manual)

**Files:**
- Create: `docs/superpowers/handoffs/2026-07-17-authentik-provider-setup.md`

This is console/API work, not repo code, and this session likely cannot reach `auth.pkfd.net` (LAN-only until Part A; and the `akadmin` API token lives in `pxe/.secrets.env` on the homelab). So the deliverable is a precise runbook Jason executes on the LAN. Produce BOTH forms.

- [ ] **Step 1: Write the manual UI runbook** (in the handoff doc), per spec §4:
  - **OAuth2/OpenID Provider** "droid-tycoon": confidential; client type Confidential; **Client authentication = `client_secret_post`** (must match `ClientSecretPost` in `oidc.ts`); redirect URI `https://droid-tycoon.pkfd.net/api/auth/oidc/callback` with **Strict** matching; signing key = default self-signed (RS256); subject mode = "Based on the User's hashed ID"; scopes `openid email profile`. Record the generated Client ID (`droid-tycoon`) and Client Secret → `pxe/.secrets.env` as `OIDC_CLIENT_SECRET`.
  - **Application** slug `droid-tycoon` bound to the provider → issuer `https://auth.pkfd.net/application/o/droid-tycoon/`, discovery at `…/.well-known/openid-configuration`.
  - **`droid-tycoon` group** + bind it to the Application (access gate — default no-binding = everyone, so the binding is required).
  - **Enrollment flow + Invitation stage**: single-use + expiring invitations; the flow creates the user and adds them to `droid-tycoon` (group-add via expression policy or the invitation's fixed `groups` data).

- [ ] **Step 2: Write the optional API script** (in the handoff doc): `curl` calls against `https://auth.pkfd.net/api/v3/` using the `akadmin` token, creating the provider, application, and group. Mark it "run from the LAN by Jason" and note the exact endpoints (`/providers/oauth2/`, `/core/applications/`, `/core/groups/`). Keep it as documentation Jason can run, not something executed here.

- [ ] **Step 3: Confirm the discovery contract matches the code**: the handoff must state that `OIDC_ISSUER_URL` (trailing slash) → `…/.well-known/openid-configuration` resolves, and that the provider's client-auth method equals `client_secret_post`. Cross-reference `src/lib/server/oidc.ts`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/handoffs/2026-07-17-authentik-provider-setup.md
git commit -m "docs(auth): Authentik provider/app/enrollment/group runbook (manual + API)"
```

---

## Task 9: Whole-branch verification + PR

**Files:** none (verification + PR).

- [ ] **Step 1: Full local verification**

Run (Postgres up, test DBs reset per Task 1 Step 5 if not already):
```bash
cd app
npm run check
npm run test:unit
npm run test:int
npm run test:e2e
```
Expected: `check` 0 errors; unit green; int green (users/counts/profiles/importer/plans/reference/respond/oidc); e2e green (oidc-login/smoke/checklist/search/droid-art).

- [ ] **Step 2: Grep for dangling password/invite references**

Run: `cd app && grep -rn "pw_hash\|argon2\|INVITE_CODE\|DUMMY_HASH\|/register\|api/auth/login\|api/auth/register" src e2e docker-compose.yml README.md .env.example`
Expected: no matches in code (only possibly in comments/docs that intentionally mention the removal). Investigate any hit.

- [ ] **Step 3: Push the branch and open a draft PR**

```bash
cd /Users/jason/Projects/DroidTycoon/droid-tycoon-tracker/.claude/worktrees/oidc-sso-partb
git push -u origin feat/authentik-oidc-sso-partb
gh pr create --draft --base main \
  --title "feat: Authentik OIDC SSO (Part B — repo)" \
  --body "Implements Part B of docs/superpowers/specs/2026-07-17-authentik-oidc-sso-design.md: OIDC login via openid-client v6, findOrCreateOidcUser, destructive greenfield schema migration (oidc_sub+email, drop pw_hash), password/register removal, stubbed-OIDC e2e, and the droid-tycoon homelab stack + Authentik runbook. No CI — verified locally (check/unit/int/e2e green)."
```
(Base `main` so the PR shows Part B deltas cleanly; it can be retargeted onto `feat/authentik-oidc-sso` / PR #13 at merge time if Jason prefers stacking. Do not merge — Jason merges.)

---

## Self-Review

**Spec coverage (§ by §):**
- §3 new routes → Task 4. `findOrCreateOidcUser` + remove `register`/`login`/`DUMMY_HASH` → Task 2. Schema (`+oidc_sub`, `+email`, `−pw_hash`, username dedupe) → Task 1 + Task 2. Remove `/register` + invite logic, `/login` → button → Task 5. Logout local-only unchanged → kept verbatim (Task 2), route untouched. Env contract → Tasks 4 + 7. "Confirm openid-client v6 + adapter-node" → confirmed in this plan's header/constraints (v6.8.4 functional API; adapter-node confirmed from Dockerfile `node build`).
- §4 Authentik config → Task 8.
- §6 testing (unit findOrCreateOidcUser; stubbed-OIDC e2e; manual smoke) → Task 2 (+ oidc.ts unit Task 3) + Task 6 + Task 8 runbook.
- §7 Part B items 1-5 → this whole plan (1 = plan itself; 2 = Tasks 1-5; 3 = Task 7; 4 = Task 8; 5 = Tasks 2/3/6 + Task 9).

**Deviations flagged for Jason (confirm before/at implementation):**
1. **Greenfield destructive migration** — Task 1 gate.
2. **Username stability on re-login** — email updates, username stays fixed (uniqueness invariant); spec wording said "name update". Alternative: add a mutable `display_name` column.
3. **`PUBLIC_BASE_URL` vs existing `ORIGIN`** — both retained; `PUBLIC_BASE_URL` is the trusted origin for reconstructing the callback URL. If Jason prefers a single var, we can derive from `ORIGIN` and drop `PUBLIC_BASE_URL`.
4. **Homelab stack uses `image:` (built+pushed manually) not `build:`** — required by `deploy.sh`'s stack-only rsync; and a `./postgres` bind mount (per spec) vs the named-volume pattern the other stacks use. Deploy mechanism is Jason's call.

**Type consistency:** `findOrCreateOidcUser(db, { sub, email?, name? }) => { id, username }` used identically in Task 2 tests, `createTestUser`, and the callback (Task 4). `OidcConfig`/`OidcClaims`/`buildOidcStart`/`completeOidcCallback` signatures match between Task 3 definition and Task 4 usage. Cookie names (`oidc_state`/`oidc_nonce`/`oidc_verifier`, `session`) consistent across start/callback.

**Placeholder scan:** every code step contains complete code; every run step names the exact command + expected result. No TBD/TODO.
