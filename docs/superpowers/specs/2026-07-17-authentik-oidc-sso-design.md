# Authentik OIDC SSO for the Droid Tycoon app — design

- **Status:** approved (design), ready for implementation planning
- **Created:** 2026-07-17
- **Author:** Jason + Claude Code (brainstormed)
- **Repo:** `droid-tycoon-tracker`, target = the SvelteKit + Postgres app under `app/`

## 0. Scope & assumptions

**In scope (sub-project #1):** replace the app's homegrown username/password auth with
Authentik OIDC (login-with-Google, brokered by Authentik), plus the Authentik + homelab
config to make it live. Per-user cloud persistence already exists server-side
(`profiles`/`counts`/`plans` keyed by `userId`) — logging in *is* the sync, so no data-layer
work is needed beyond auth.

**Deferred (sub-project #2, separate spec):** porting the standalone `planner.html` UX
(~1,250 lines: tier ladder, long-press picker, unmerge) into Svelte. The app's current
`/planner` route is a 42-line stub; the polished UI lives in the standalone bundle. Not this
spec.

**Assumptions (veto if wrong):**
- **Greenfield auth** — no production password users with data to preserve (deploy has been
  on hold). We therefore *drop* the password machinery instead of migrating it. A destructive
  schema change is acceptable.
- App is the target frontend (decided: "commit to the SvelteKit app").

## 1. Decisions locked (brainstorm outcome)

| Decision | Choice |
|-|-|
| Target frontend | The SvelteKit app (`app/`); port standalone UI later |
| Auth model | **Authentik-only SSO** — remove local password, `/register`, invite codes |
| OIDC implementation | **`openid-client`** (Approach A); reuse the existing session cookie/table |
| Ingress | **cloudflared** tunnel; expose `droid-tycoon.pkfd.net` + `auth.pkfd.net` publicly |
| Admin protection | Cloudflare Access on `auth.pkfd.net` `/if/admin/*` + `/api/*`; MFA on admin users |
| Enrollment | **Invitation links** — single-use, expiring; friend self-enrolls via Google |
| App access gate | `droid-tycoon` group bound to the Authentik Application |
| Google consent | Publish (basic `openid email profile` scopes; no verification needed) |

## 2. Architecture & login flow

The app remains a confidential OIDC client. Only the *credential check* changes; the session
layer is untouched.

```
friend --> app /login ("Sign in with Google")
       --> /api/auth/oidc/start   --> auth.pkfd.net (Authentik) --> Google
                                                   <- id_token (sub, email, name)
       --> /api/auth/oidc/callback --> findOrCreateOidcUser --> createSession --> session cookie
       --> app (logged in; their Postgres data loads automatically)
```

Everything after `createSession` — `hooks.server.ts`, `locals.user`, every `/api` route, and
the per-user data model — is unchanged. Authentik brokers Google internally, so the app never
talks to Google directly and integrates exactly one protocol (OIDC to Authentik).

## 3. App code changes (SvelteKit)

- **New routes:**
  - `GET /api/auth/oidc/start` — `openid-client` builds the authorize URL with PKCE +
    `state` + `nonce`, stashed in short-lived httpOnly cookies; 302 to Authentik.
  - `GET /api/auth/oidc/callback` — validate `state`/`nonce`, exchange the code, validate the
    id_token via discovery/JWKS, extract `sub`/`email`/`name`, `findOrCreateOidcUser`,
    `createSession`, set the existing `session` cookie, 302 into the app.
- **`src/lib/server/services/users.ts`:** add `findOrCreateOidcUser({ sub, email, name })`.
  **Remove** `register`, `login` (password), and `DUMMY_HASH`. Keep `createSession`,
  `validateSession`, `logout` verbatim.
- **Schema migration (`users`):** add `oidc_sub text unique not null` (match key = Authentik's
  stable hashed-ID `sub`) and `email text`; **drop `pw_hash`**. `username` stays as the
  display name, populated from `preferred_username`/`name`/`email`, kept unique
  (dedupe-on-collision in the plan).
- **Remove** `/register` route + invite-code logic. `/login` becomes a single "Sign in with
  Google" button linking to `/api/auth/oidc/start`.
- **Logout:** clears the app session (delete row + cookie). Local-only by default — because
  Authentik holds an SSO session, re-login is one click (acceptable here). RP-initiated
  Authentik logout is an optional later add.
- **New env** (mirrors the existing patchmon OIDC stub contract): `OIDC_ISSUER_URL`,
  `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `PUBLIC_BASE_URL`.
- **Plan must confirm:** `openid-client` v6 API surface (against current docs) and the
  SvelteKit adapter used by `app/Dockerfile` (expected `adapter-node`).

## 4. Authentik config (manual — no blueprints exist in the homelab)

- **OAuth2/OpenID Provider:** confidential; redirect URI
  `https://droid-tycoon.pkfd.net/api/auth/oidc/callback` (Strict matching); RS256 via the
  default self-signed signing cert; subject mode = "Based on the User's hashed ID"; scopes
  `openid email profile`.
- **Application:** slug `droid-tycoon` → issuer
  `https://auth.pkfd.net/application/o/droid-tycoon/` (discovery at
  `…/.well-known/openid-configuration`).
- **Enrollment flow + Invitation stage:** invitations single-use + expiring; the flow creates
  the user and **adds them to the `droid-tycoon` group** (via a group-add expression policy or
  the invitation's fixed data — exact wiring decided in the plan).
- **`droid-tycoon` group** bound to the Application (the access gate; default no-binding =
  everyone, so this binding is required).
- Cloudflare Access + admin MFA are ingress concerns → Part A (§7).

## 5. Persistence (unchanged, stated for completeness)

Per-user `profiles`/`counts`/`plans` keyed by `userId`. Logging in loads the user's data
automatically — zero manual action by users (the original ask). No refresh tokens; the app's
own 30-day session cookie governs app-session lifetime, re-bouncing through Authentik on
expiry.

## 6. Testing

- Unit-test `findOrCreateOidcUser` (new user; returning user; email/name update on re-login)
  via the existing integration-DB harness.
- An e2e that drives the login redirect against a **stubbed OIDC provider** (real Authentik is
  not available in-loop; the repo has no CI — verification is local + a stub).
- Manual smoke against real `auth.pkfd.net` at deploy time.

## 7. Work breakdown (two execution parts)

The work splits by access surface and skillset. Part A and the app-code portion of Part B can
proceed **in parallel** (the app code is testable against a stubbed OIDC provider); the
end-to-end smoke test needs both plus the Authentik provider config.

### Part A — claude-desktop: UniFi + Cloudflare ingress (console/network)

1. **Cloudflare DNS (public):** public records for `droid-tycoon.pkfd.net` and
   `auth.pkfd.net` pointing at the cloudflared tunnel (`<uuid>.cfargotunnel.com`, proxied).
   Preserve split-horizon: internal Technitium keeps answering these on-LAN → both paths reach
   Traefik.
2. **cloudflared tunnel:** add ingress hostname rules for both names → the Traefik origin on
   `.12:443` (Host-based routing; `noTLSVerify`/`originServerName` as needed for the internal
   cert). Deploy/confirm the `cloudflared` connector.
3. **Cloudflare Access (Zero Trust):** protect `auth.pkfd.net/if/admin/*` and
   `auth.pkfd.net/api/*` — allow only Jason. Leave login paths public
   (`/application/o/*`, `/if/flow/*`, `/source/*`, `/static/*`).
4. **UniFi:** ensure cloudflared can egress 443 to Cloudflare and reach Traefik/authentik on
   `.12`; verify no inter-VLAN rule blocks the tunnel origin; confirm Servers VLAN 20 flows.
5. **Verify:** an off-LAN device resolves + reaches both hostnames over HTTPS, and
   `/if/admin/` triggers the Cloudflare Access challenge.
6. **Adjacent console prerequisites (Google/Authentik — not strictly UniFi/Cloudflare, assign
   as convenient):** publish the Google consent screen (or add friends as GCP test users);
   enable MFA (TOTP/WebAuthn) on `akadmin` + `jason` in Authentik.

### Part B — Claude Code (this repo), after handoff

1. Write the implementation plan (writing-plans) from this spec.
2. **App code:** schema migration; `users.ts` (`findOrCreateOidcUser`, remove password); OIDC
   `start`/`callback` routes via `openid-client`; remove `/register` + password login;
   `/login` → "Sign in with Google"; wire env vars.
3. **`stacks/droid-tycoon/`** compose stack per homelab conventions: app (built from
   `app/Dockerfile`) + own Postgres (bind-mounted `./postgres`), `proxy` network, 4 Traefik
   labels for `droid-tycoon.pkfd.net`, env from `.env` sourced from `pxe/.secrets.env`; run
   `db:migrate` + `db:seed` on first deploy; bookkeeping (`apps.md`, glance, homarr,
   `TASKS.md`).
4. **Authentik provider/application/enrollment/group** (§4): attempt via the Authentik API
   using the `akadmin` token **if** the executing session can reach `auth.pkfd.net` on the
   LAN; otherwise emit exact manual click-steps. This is console/API work, not repo code — it
   is the one Part-B item that may fall back to manual.
5. Tests (§6) + local verification.

## 8. Risks

- **Authentik is a login SPOF** on VM `.12`; if it is down, nobody logs in. `akadmin` is
  break-glass *at the Authentik layer*; by the Authentik-only choice the app has **no** local
  fallback. Conscious call — an optional env-gated local admin escape hatch can be added if
  desired.
- **Public IdP exposure** — mitigated by Cloudflare Access on admin + MFA.
- **Greenfield schema change is destructive** to any existing password users (assumed none).

## 9. Out of scope

The planner UI port (sub-project #2), refresh tokens, SAML, ForwardAuth/Outpost, cross-device
sync beyond the existing server-side model.
