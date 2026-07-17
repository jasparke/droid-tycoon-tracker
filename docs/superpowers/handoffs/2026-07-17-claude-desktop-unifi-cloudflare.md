# Handoff → claude-desktop: UniFi + Cloudflare ingress for droid-tycoon

**Date:** 2026-07-17
**For:** claude-desktop (has the homelab context / console access Jason works from)
**Paired repo work:** `droid-tycoon-tracker`, spec at
`docs/superpowers/specs/2026-07-17-authentik-oidc-sso-design.md` (Part B is handled in the
repo by Claude Code).

## Why this exists

We're adding **Authentik OIDC SSO (login-with-Google)** to a self-hosted SvelteKit app,
`droid-tycoon`, so friends can log in and keep cloud-synced progress. The app will live at
`https://droid-tycoon.pkfd.net`. Because the OIDC flow redirects the **friend's browser** to
Authentik at `https://auth.pkfd.net`, and friends are **remote (off-LAN)**, both hostnames
must be reachable from the public internet. Today they resolve **LAN/VPN-only** (split-horizon
Technitium DNS; no public exposure). Your job is the ingress: make both reachable publicly via
**Cloudflare Tunnel**, without weakening the lab.

## Homelab facts you need (from the `~/Projects/homelab/thelab` review)

- **Authentik** is live at `https://auth.pkfd.net` (v2026.5.3), Docker Compose via Komodo on
  Proxmox VM 112 = `docker-host` at `10.10.20.12` (Servers VLAN 20, node `dalinar`).
- **Reverse proxy:** Traefik v3.7 on `.12`, ports 80/443/8080; `*.pkfd.net` wildcard TLS via
  Let's Encrypt **DNS-01 (Cloudflare token)**; apps opt into routing via Traefik labels.
- **DNS:** Technitium, split-horizon, authoritative for `pkfd.net` internally; `*.pkfd.net`
  resolves to Traefik `.12` **on-LAN only**. Convention: *do not* add internal names to public
  Cloudflare DNS — but these two hostnames are the deliberate exception (they must go public).
- **Cloudflare** already manages the `pkfd.net` domain (used today only for DNS-01 certs, not
  public serving). Your notes describe the "Seerr/Wizarr-class public app" pattern as
  **Cloudflare Tunnel → Traefik**; no tunnel exists for internal apps yet.
- **Users:** `akadmin` (break-glass admin) and `jason` (Gmail-linked, Admins).

## Tasks

### 1. Cloudflared tunnel → Traefik
- Stand up (or reuse) a `cloudflared` connector that can reach Traefik on `.12:443`.
- Add ingress hostname rules:
  - `droid-tycoon.pkfd.net` → `https://10.10.20.12:443` (Host-preserving; set
    `originServerName`/`noTLSVerify` as needed for the internal LE cert).
  - `auth.pkfd.net` → `https://10.10.20.12:443` (same).
- Keep everything else in the lab **off** the tunnel — only these two names.

### 2. Public DNS (Cloudflare)
- Create proxied (orange-cloud) records for `droid-tycoon.pkfd.net` and `auth.pkfd.net`
  pointing at the tunnel (`<tunnel-uuid>.cfargotunnel.com`).
- Confirm split-horizon still holds: on-LAN, Technitium keeps answering both → LAN users never
  leave the house; off-LAN, Cloudflare answers → tunnel → Traefik.

### 3. Cloudflare Access (Zero Trust) — protect the admin surface
Authentik's login endpoints must stay public, but its admin/API must not be internet-open.
- **Public (no Access):** `auth.pkfd.net/application/o/*`, `/if/flow/*`, `/source/*`,
  `/static/*` (these are the OIDC + login-UI + Google-callback paths).
- **Protected (Access policy, allow only Jason / `jasonparker92@gmail.com`):**
  `auth.pkfd.net/if/admin/*` and `auth.pkfd.net/api/*`.
- `droid-tycoon.pkfd.net` itself stays public (the app does its own Authentik auth).

### 4. UniFi
- Ensure `cloudflared` can egress 443 to Cloudflare and reach Traefik/Authentik on `.12`.
- Verify no inter-VLAN firewall rule blocks the tunnel origin → `.12:443`; confirm Servers
  VLAN 20 allows the needed flows. If `cloudflared` runs on `.12` itself, the origin is
  effectively local and UniFi changes are minimal — just confirm outbound 443.

### 5. Adjacent console prerequisites (Google / Authentik — do these here, they're the same
flavor of click-ops)
- **Google Cloud** (project `pkfd-homelab-auth`, consent screen "Spark Lab"): publish the
  consent screen (basic `openid email profile` scopes need no verification), **or** keep it in
  Testing and add each friend's Gmail as a test user (100-user cap).
- **Authentik:** enable MFA (TOTP/WebAuthn) on `akadmin` and `jason` before the admin surface
  is reachable publicly.

## Acceptance / verification

- From an **off-LAN** device (phone on cellular): `https://droid-tycoon.pkfd.net` and
  `https://auth.pkfd.net` both load over HTTPS via Cloudflare.
- `https://auth.pkfd.net/if/admin/` triggers the **Cloudflare Access** challenge; a
  non-allowed identity is refused.
- On-LAN, both still resolve internally to Traefik `.12` (split-horizon intact).
- Authentik admin accounts prompt for **MFA**.

## Not your job (handled in the repo by Claude Code — Part B)

App code (OIDC routes, schema, login UI), the `stacks/droid-tycoon/` compose stack, and the
Authentik **OAuth2 Provider + Application + enrollment flow + `droid-tycoon` group** creation.
The redirect URI you'll see referenced there is
`https://droid-tycoon.pkfd.net/api/auth/oidc/callback`.
