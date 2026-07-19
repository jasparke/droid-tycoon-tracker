# Handoff → Jason (LAN): Authentik provider/application/enrollment/group for droid-tycoon

**Date:** 2026-07-17
**Executed by:** Jason, on the LAN (this session cannot reach `auth.pkfd.net` — off-network,
and the `akadmin` API token lives in `pxe/.secrets.env` on the homelab, not in this repo).
**Paired repo work:** `droid-tycoon-tracker`, spec §4:
[`docs/superpowers/specs/2026-07-17-authentik-oidc-sso-design.md`](../specs/2026-07-17-authentik-oidc-sso-design.md).
Linked from [`stacks/droid-tycoon/README.md`](../../../stacks/droid-tycoon/README.md).

## Why this exists

`droid-tycoon` is the **first OIDC client** on this Authentik instance (v2026.5.3, live at
`https://auth.pkfd.net`, no Redis, Compose on `docker-host` / `10.10.20.12`). Nothing to
reuse — no existing OAuth2 provider, application, enrollment flow, or blueprint. A Google
OAuth **Source** is already configured (slug `google`, GCP project `pkfd-homelab-auth`,
consent screen "Spark Lab", currently **Testing** mode) — this runbook builds on that source,
it does not recreate it.

**Testing-mode caveat:** until Part A publishes the Google consent screen, only GCP test
users (added explicitly in the Google Cloud console, 100-user cap) can complete the Google
leg of sign-in — everyone else gets a Google-side "app not verified / access blocked" screen
regardless of how correctly this runbook is executed. If you're testing before that's done,
add your test Gmail addresses on the Google side first.

Do this after Part A's ingress work (`auth.pkfd.net` reachable, Cloudflare Access on the
admin surface) so `/if/admin/` is safely public while you work, and after MFA is enabled on
`akadmin`/`jason`.

## What "done" looks like

- An OAuth2/OpenID **Provider** named `droid-tycoon`.
- An **Application** with slug `droid-tycoon`, bound to that provider.
- A **Group** named `droid-tycoon`, bound to the Application (the access gate).
- An **enrollment flow** + at least one **Invitation** that: validates a single-use, expiring
  token; lets the invitee sign in with Google; creates the local user; adds them to the
  `droid-tycoon` group.
- A recorded **Client Secret** in `pxe/.secrets.env` as `OIDC_CLIENT_SECRET`.
- The discovery document at
  `https://auth.pkfd.net/application/o/droid-tycoon/.well-known/openid-configuration`
  resolving and matching what `app/src/lib/server/oidc.ts` expects (Step 3 below).

---

## Step 1 — Manual UI runbook

All navigation paths below are for the Authentik v2026.5 admin interface
(`https://auth.pkfd.net/if/admin/`). A couple of sub-labels are noted as uncertain where I
can't verify the exact v2026.5 wording from here — go with the closest match you see.

### 1a. OAuth2/OpenID Provider

1. **Applications → Providers → Create.**
2. Provider type: **OAuth2/OpenID Provider**.
3. **Name:** `droid-tycoon`
4. **Authorization flow:** leave the default (something like
   `default-provider-authorization-implicit-consent` — *label may differ slightly*). No need
   for an explicit-consent screen for a single-app, invite-only instance.
5. **Protocol settings:**
   - **Client type:** `Confidential`
   - **Client ID:** accept the auto-generated value, or set it to `droid-tycoon` for
     readability — either way, whatever value ends up here becomes `OIDC_CLIENT_ID`.
   - **Client Secret:** auto-generated. **Copy it now** — Authentik does not show it again
     after you navigate away without re-editing. This becomes `OIDC_CLIENT_SECRET` (Step 1e).
   - **Redirect URIs/Origins:** add exactly
     `https://droid-tycoon.pkfd.net/api/auth/oidc/callback`
     with match mode **Strict** (not RegEx, not substring — an exact string match). This
     must be byte-for-byte the value you'll set as `OIDC_REDIRECT_URI`.
   - **Signing Key:** the default self-signed certificate (RS256) — whatever Authentik
     already uses for its other providers. Don't generate a new one.
6. **Advanced protocol settings:**
   - **Scopes:** the three default scope mappings — `openid`, `email`, `profile` (these ship
     built-in as `authentik default OAuth Mapping: OpenID '...'` — *exact mapping names may
     differ slightly*; just confirm openid/email/profile are all selected and nothing extra).
   - **Subject mode:** `Based on the User's hashed ID`. This is what makes the token's `sub`
     claim a stable, non-reassignable identifier — it's the match key
     `findOrCreateOidcUser` keys off in the app.
   - **Include claims in id_token:** leave checked (default) — the app reads `sub`/`email`/
     `preferred_username`/`name` straight off the id_token claims in
     `completeOidcCallback()`, it doesn't hit the userinfo endpoint separately.
7. **Client authentication method** — Authentik does not expose this as a separate
   provider-level dropdown (unlike Keycloak). Its token endpoint accepts credentials via
   `client_secret_post` (POST body — required, per **Step 3**) out of the box; there's
   nothing to *set* here. This is a verify-only item, not a configure item — confirmed in
   Step 3 against the discovery document's `token_endpoint_auth_methods_supported`.
8. **Create.**

### 1b. Application

1. **Applications → Applications → Create.**
2. **Name:** `Droid Tycoon` (display name — free text)
3. **Slug:** `droid-tycoon` — this is load-bearing: it's the path segment in the issuer URL
   `https://auth.pkfd.net/application/o/droid-tycoon/`. Get it right the first time; changing
   it later changes the issuer and breaks discovery for anyone with the old URL cached.
4. **Provider:** select the `droid-tycoon` provider from 1a.
5. **Policy engine mode:** leave default (`all` — all bound policies/group/user bindings must
   pass).
6. **Launch URL** (optional): `https://droid-tycoon.pkfd.net`
7. **Create.**

### 1c. Group + access-gate binding

1. **Directory → Groups → Create.**
2. **Name:** `droid-tycoon`. No parent group, no special attributes needed.
3. **Create.**
4. Back on the **Application** from 1b, open its **Policy / Group / User Bindings** tab
   (*tab label may differ slightly*).
5. **Bind → Group → `droid-tycoon`.**
6. **Create/save the binding.**

This binding is not optional cosmetic tidiness — Authentik's default when an Application has
**no** policy/group/user bindings at all is "everyone with any account can open it." Binding
the group is what actually restricts `droid-tycoon.pkfd.net` access to invited friends.
Confirm the binding exists before treating this as done.

### 1d. Enrollment flow + Invitation stage

**Goal:** a friend opens a link Jason sends them → the link only works once, only before an
expiry, and only if unused → they click "Sign in with Google" → they land in the app already
a member of `droid-tycoon`.

1. **Flows & Stages → Flows → Create.**
   - **Name:** `Droid Tycoon enrollment`
   - **Slug:** `droid-tycoon-enrollment`
   - **Designation:** `Enrollment`
   - Leave **Authentication** requirement at its default (no prior auth required — these are
     brand-new identities).
2. **Create the stages** (Flows & Stages → Stages → Create), then bind each to the flow via
   the flow's **Stage Bindings** tab, in this order:

   | Order | Stage | Type | Key settings |
   |-|-|-|-|
   | 10 | `droid-tycoon-invitation` | Invitation stage | **Continue flow without invitation:** OFF. This is what makes the token mandatory — anyone hitting this flow URL without a valid, unexpired, unused `?itoken=` gets refused. |
   | 20 | `droid-tycoon-identification` | Identification stage | **Show sources:** ON, select the `google` source. If you want Google to be the *only* path in (no local username/password ever offered here), leave the identification "user fields" empty/disabled so only the source button renders (*exact toggle label may differ slightly — look for "Show sources"/"Sources" on the Identification stage form*). |
   | 30 | `droid-tycoon-user-write` | User Write stage | Leave defaults (creates a new local user from the Google claims passed through). |
   | 40 | `droid-tycoon-user-login` | User Login stage | Leave defaults — logs the freshly-created user in at the end of enrollment. |

3. **Add the friend to the `droid-tycoon` group as part of this flow** — bind an **expression
   policy** to the stage-binding for the stage *after* User Write (i.e. the order-40 User
   Login binding), so the user record already has a primary key when the policy runs:
   - **Customization → Policies → Create → Expression Policy.**
   - **Name:** `droid-tycoon-group-add`
   - **Expression:**
     ```python
     from authentik.core.models import Group

     group, _ = Group.objects.get_or_create(name="droid-tycoon")
     user = request.context.get("pending_user")
     if group and user and user.pk:
         group.users.add(user)
     return True
     ```
     The exact context key for the in-flight user (`pending_user` above) — verify against the
     expression reference panel Authentik shows right on this same policy-editor page before
     saving; if the key differs, the `.get(...)` call is the only line that needs to change.
   - Go back to the flow's **Stage Bindings** tab, open the **order-40** binding (User Login),
     and attach this policy under its **Policies** tab.
   - This always returns `True` (never blocks the flow) — it's a side-effecting policy, not a
     gate. The invitation stage (order 10) is the actual gate.
   - **Optional upgrade, not required for a working setup:** if you later want different
     invitations to grant different groups, give the Invitation a **Fixed data** JSON blob
     (e.g. `{"groups": ["droid-tycoon"]}`) and change the expression to read
     `request.context.get("prompt_data", {}).get("groups", [])` instead of the hardcoded
     `"droid-tycoon"` string. Not needed while there's only one group.
4. **Point the Google source at this flow for brand-new identities** (so a friend who
   authenticates via `google` and has no matching local user lands here): open the `google`
   source (**Directory → Federation & Social login**, or **Applications → Sources** —
   *section label may differ slightly*) and set its **Enrollment flow** to
   `droid-tycoon-enrollment`.
5. **Create at least one invitation** — **Flows & Stages → Invitations → Create**
   (*top-level nav grouping for Invitations may differ slightly — it lives alongside
   Flows/Stages/Policies*):
   - **Name:** something identifying the friend, e.g. `friend-alex`
   - **Flow:** `droid-tycoon-enrollment`
   - **Single use:** checked. Don't rely on an assumed default — check it explicitly.
   - **Expires:** set an explicit expiry (e.g. 7 days out). Don't leave it open-ended.
   - **Create.**
   - Authentik generates a link of the shape
     `https://auth.pkfd.net/if/flow/droid-tycoon-enrollment/?itoken=<token>`. Copy that exact
     URL and send it to the friend directly — they should not start from
     `auth.pkfd.net`'s general login page, since that wouldn't carry the invitation token.

### 1e. Record the Client Secret

Copy the Client Secret from **1a** into `pxe/.secrets.env` on the homelab as:

```bash
OIDC_CLIENT_SECRET=<the value from 1a>
```

At deploy time this gets mirrored into the stack's `.env`
(`stacks/droid-tycoon/README.md` step (b): `cp pxe/.secrets.env stacks/droid-tycoon/.env`).
Also set the other four OIDC env vars there per the design spec (§3) and
`stacks/droid-tycoon/.env.example`:

```bash
OIDC_ISSUER_URL=https://auth.pkfd.net/application/o/droid-tycoon/
OIDC_CLIENT_ID=droid-tycoon
OIDC_CLIENT_SECRET=<from 1a>
OIDC_REDIRECT_URI=https://droid-tycoon.pkfd.net/api/auth/oidc/callback
PUBLIC_BASE_URL=https://droid-tycoon.pkfd.net
```

`OIDC_ISSUER_URL` must equal the issuer from **1b** **exactly**, trailing slash included —
see Step 3 for why the trailing slash isn't cosmetic.

---

## Step 2 — Optional API-script alternative (documentation only — run from the LAN by Jason)

Everything in Step 1 can be done via `https://auth.pkfd.net/api/v3/` instead of clicking
through the admin UI, using the `akadmin` API token (`pxe/.secrets.env` on the homelab). This
is **not executed by this session** — it's here so Jason can run it directly on the LAN if
he'd rather script it than click through the UI. Treat the manual steps in Step 1 as the
source of truth for *what* gets configured; this is just an alternate *how*.

```bash
# Run on the homelab, with the akadmin token loaded:
source pxe/.secrets.env   # provides AUTHENTIK_TOKEN (or whatever it's named there)
AK=https://auth.pkfd.net/api/v3
AUTH_HDR=(-H "Authorization: Bearer $AUTHENTIK_TOKEN" -H "Content-Type: application/json")

# 1. Create the OAuth2/OpenID Provider.
#    (You'll need the PK of the default signing certificate and the default authorization
#    flow — GET /api/v3/crypto/certificatekeypairs/ and /api/v3/flows/instances/?slug=...
#    first if you're scripting end-to-end rather than filling in known-good values.)
curl -s "${AUTH_HDR[@]}" -X POST "$AK/providers/oauth2/" -d '{
  "name": "droid-tycoon",
  "client_type": "confidential",
  "client_id": "droid-tycoon",
  "redirect_uris": [
    {"matching_mode": "strict", "url": "https://droid-tycoon.pkfd.net/api/auth/oidc/callback"}
  ],
  "sub_mode": "hashed_user_id",
  "include_claims_in_id_token": true,
  "property_mappings": []
}'
# Capture the returned "pk" (provider id) and "client_secret" from the response —
# client_secret is only ever returned in full on create/regenerate.

# 2. Create the Application, bound to the provider pk from step 1.
curl -s "${AUTH_HDR[@]}" -X POST "$AK/core/applications/" -d '{
  "name": "Droid Tycoon",
  "slug": "droid-tycoon",
  "provider": <provider_pk_from_step_1>
}'

# 3. Create the group.
curl -s "${AUTH_HDR[@]}" -X POST "$AK/core/groups/" -d '{
  "name": "droid-tycoon"
}'

# 4. Bind the group to the application as an access policy binding.
#    (Application policy/group/user bindings live under /api/v3/policies/bindings/,
#    referencing the application's PolicyEngine binding target and the group's pk.)
curl -s "${AUTH_HDR[@]}" -X POST "$AK/policies/bindings/" -d '{
  "target": "<application_pk_or_uuid_from_step_2>",
  "group": "<group_pk_from_step_3>",
  "order": 0
}'
```

The flow/stage/invitation side (§1d) is stateful and order-dependent enough (flow → stages →
bindings → policy → invitation, each referencing the previous by pk) that it's a poor fit for
a short copy-paste script — do that part through the UI even if you script the provider/
application/group above. If you do want to script it fully, the relevant endpoints are
`/api/v3/flows/instances/`, `/api/v3/stages/invitation/invitations/`,
`/api/v3/stages/user_write/`, `/api/v3/stages/identification/`,
`/api/v3/policies/expression/`, and `/api/v3/flows/bindings/` (stage-to-flow bindings) —
consult `https://auth.pkfd.net/api/v3/schema/` (Authentik's live OpenAPI schema) for the
exact required fields before scripting against them, since flow/stage binding shapes are the
most likely to have shifted between versions.

---

## Step 3 — Verify the contract against the app code

Cross-reference: `app/src/lib/server/oidc.ts` — `discover()`, `buildOidcStart()`,
`completeOidcCallback()`.

1. **Discovery resolves, at the exact issuer URL (trailing slash matters):**
   ```bash
   curl -s https://auth.pkfd.net/application/o/droid-tycoon/.well-known/openid-configuration | jq .
   ```
   Confirm the response's `"issuer"` field is exactly
   `https://auth.pkfd.net/application/o/droid-tycoon/` — and that this is byte-for-byte what
   you set as `OIDC_ISSUER_URL`.

   The trailing slash is not stylistic. `oidc.ts`'s `discover()` calls
   `client.discovery(new URL(cfg.issuerUrl), ...)`, and `openid-client` builds the
   `.well-known/openid-configuration` URL by relative resolution against `cfg.issuerUrl`. Per
   standard URL resolution rules, a relative path resolves *underneath* a trailing-slash base
   (`.../droid-tycoon/` + `.well-known/...` → `.../droid-tycoon/.well-known/...`, correct) but
   *replaces the last segment* of a non-trailing-slash base (`.../droid-tycoon` +
   `.well-known/...` → `.../.well-known/...`, wrong — drops `droid-tycoon` entirely and 404s).
   `OIDC_ISSUER_URL` without the trailing slash breaks discovery.

2. **Client-auth method matches `client_secret_post`:**
   In the same discovery JSON, confirm `"token_endpoint_auth_methods_supported"` includes
   `"client_secret_post"`. This must line up with `oidc.ts`'s `discover()`:
   ```ts
   client.discovery(
     new URL(cfg.issuerUrl),
     cfg.clientId,
     undefined,
     client.ClientSecretPost(cfg.clientSecret),   // <- forces POST-body client auth
     ...
   )
   ```
   `client.ClientSecretPost(...)` is `openid-client`'s explicit selection of
   `client_secret_post` as the token-endpoint auth method — the app will always send the
   client secret in the POST body, never as an `Authorization: Basic` header. If Authentik's
   discovery doesn't advertise `client_secret_post` support, the token exchange in
   `completeOidcCallback()` fails at the `authorizationCodeGrant()` call.

3. **Redirect URI exact-matches:**
   Confirm the provider's redirect URI (Step 1a) is exactly
   `https://droid-tycoon.pkfd.net/api/auth/oidc/callback` with **Strict** matching, and that
   this is byte-for-byte `OIDC_REDIRECT_URI`. `buildOidcStart()` passes
   `redirect_uri: cfg.redirectUri` straight through to Authentik's authorize endpoint —
   Strict matching means any deviation (trailing slash, `http` vs `https`, different path)
   gets rejected by Authentik before the user ever sees a consent screen.

4. **Scopes:** confirm `"scopes_supported"` in the discovery doc includes `openid`, `email`,
   `profile` — `oidc.ts`'s `SCOPE = 'openid email profile'` constant is what
   `buildOidcStart()` sends in the authorize request; Authentik should already support these
   via the three default scope mappings selected in Step 1a.6.

5. **Access gate works end-to-end:** with a real invitation (Step 1d.5), a friend who
   completes enrollment ends up: (a) a local Authentik user, (b) a member of the
   `droid-tycoon` group, (c) able to load `https://droid-tycoon.pkfd.net` and get bounced
   through `/api/auth/oidc/start` → Google → back → logged in. A *non*-invited identity (or
   an identity not in the `droid-tycoon` group) should be refused access to the Application
   at the Authentik layer — confirms the Step 1c binding is doing its job as the actual gate,
   not just the invitation.

If all five hold, the Authentik side of the contract matches what `oidc.ts` assumes, and the
only remaining unknown is Google consent-screen publish status (Part A, tracked separately —
Testing mode still limits sign-in to GCP test users regardless of anything in this doc).
