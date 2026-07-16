# Standalone Droid Tycoon Planner — deploy bundle

A single self-contained `planner.html` (inline CSS/JS, no build step) plus the droid
art it references. Fully client-side: state lives in `localStorage` + the URL hash.
This is the copy meant to be **self-hosted** (e.g. on Proxmox) so a friend can use it
without depending on the full SvelteKit app or any server.

> This is a different artifact from the multi-user web app under `app/` (SvelteKit +
> Postgres). The planner here has **no** server, DB, or env dependency — it is pure
> static hosting.

## Layout

| Path | In git? | What |
|-|-|-|
| `planner.html` | yes | The deliverable — the finished standalone planner |
| `assemble.sh` | yes | Builds `dist/` (planner.html + the droid art it needs) |
| `Caddyfile` | yes | Ready static-server config pointed at `dist/` |
| `dist/` | no (gitignored) | Assembled, deployable web root — regenerate any time |

The droid art (`assets/droids/*.webp`) is **single-sourced** from the repo's canonical
set at `app/static/assets/droids/` — it is not duplicated in git. `assemble.sh` copies
it into `dist/` at build time.

## Build

From a full repo checkout:

```sh
cd standalone
./assemble.sh          # -> standalone/dist/{planner.html, assets/droids/*.webp}
```

`dist/` is the entire web root. Total payload is ~13 MB (177 art files the planner
actually references; the copy pulls the full canonical set for safety).

## Serve

Serve `dist/` over **http(s)** — not `file://`. Some browsers block `localStorage` on
`file://` pages, and this planner needs `localStorage` to persist a player's progress.
Any static host fixes this.

Pick one:

```sh
# Caddy (uses the bundled Caddyfile; edit :8080 / TLS to taste)
caddy run --config ./Caddyfile

# Caddy, one-liner, no config file
caddy file-server --root ./dist --listen :8080

# nginx in a throwaway container
docker run --rm -p 8080:80 -v "$PWD/dist":/usr/share/nginx/html:ro nginx:alpine
```

Then open `http://<host>:8080/planner.html`. Terminate TLS at your existing reverse
proxy and point it here, or give Caddy a real hostname to have it manage certs.

`.webp` must be served as `image/webp` — nginx and Caddy both do this by default.

## How image loading works (why art must sit next to the HTML)

`droidImg()` resolves each image in this order:

1. `imgMem[f]` — an in-session blob cache.
2. `assets/droids/<file>` — **relative to `planner.html`.** ← this is why `assets/`
   must ship in the same web root.
3. On load error, `https://droidtrakr.com/droid-tycoon/assets/droids/<file>` — a remote
   fallback. It works, but it defeats self-hosting and needs outbound internet, so keep
   `assets/` beside the HTML.

Filenames are `normName(droid) + "_" + tier + ".webp"`, where `normName` uppercases and
strips every non-`A–Z0–9` char, and the Base tier maps to the suffix `Default`
(e.g. `GONK_Default.webp`, `R4_Beskar.webp`).

**Asset coverage is complete:** the planner references 177 unique droid/tier images
across its 4 super-rebirth cycles, and every one is present in the canonical set — zero
gaps, so image loads never fall back to the remote host.

## State / persistence (don't lose player progress on redeploy)

- State is `localStorage` (key `droidTycoonTracker_v3`) + the URL hash — bookmarking a
  planned build preserves it.
- `localStorage` is **per-origin**, so keeping the same scheme+host+port across redeploys
  keeps existing progress. Changing the origin starts players fresh.
- Optional cloud sync (Supabase, via the `☁` button: URL + anon key + a shared code;
  last-write-wins) is entirely optional and unrelated to hosting.
