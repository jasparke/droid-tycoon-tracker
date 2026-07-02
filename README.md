# Droid Tycoon Rebirth Tracker

A single-file, offline-friendly tracker for **Star Wars: Droid Tycoon** (Fortnite). Plan rebirths, track which droids you own at which tier, see income / upgrade-chip costs / sell values, and manage multiple player profiles — with optional cross-device cloud sync.

**[▶ Live version](https://YOUR-USERNAME.github.io/droid-tycoon-tracker/)** *(update this link after enabling GitHub Pages)*

## Features

- **All 4 rebirth cycles × 27 rebirths** with exact credit costs, Nova crystal counts, credit/XP multipliers, and unlock slots.
- **Full droid reference for 68 droids** — class (Common → Iconic), type (Worker / Astromech / Battle), and per-tier **income, buy cost, and sell value** (Base → Beskar).
- **Per-tier inventory counts** — record how many copies you physically own at each tier (a Beskar copy counts toward lower requirements but doesn't imply you own the lower tiers).
- **Search** any droid across all cycles, with relevance to your current rebirth, per-step chip-upgrade costs, and +/- to adjust counts.
- **Planner** — tick multiple rebirth levels to get the combined droids needed (deduped to the highest tier of each).
- **Droids to Keep**, **All Droids**, and **Inventory** views, plus a **Nova Shop / Cosmetics / flawless** reference panel.
- **Multiple profiles**, each with isolated inventory & progress. Export/Import via code, and optional **Supabase cloud sync** for cross-device.

## Use it

Just open `index.html` in a browser — everything runs client-side. Progress is saved locally (and mirrored into the URL, so bookmarking preserves it).

> **Tip:** hosting it (GitHub Pages / any static host) makes `localStorage` reliable — some browsers block storage for `file://` pages.

## Cloud sync (optional)

1. Create a free [Supabase](https://supabase.com) project.
2. In the Supabase **SQL editor**, run [`schema.sql`](schema.sql). It seeds the droid/rebirth reference tables and creates a `players` sync table.
3. In Supabase **Settings ▸ API**, copy your **Project URL** and **anon public key**.
4. In the tracker, click the **☁** button, paste the URL + key, and choose a **sync code** (a secret you reuse on every device).

Use the same URL/key/sync code on another device to pull your profiles. Sync is last-write-wins by timestamp.

> **Security note:** the included RLS policy is open (anyone with the anon key *and* your sync code can read/write that row). Treat the sync code like a password. Fine for personal use.

## Data

Game data is transcribed from the community/dev-maintained *Droid Tycoon* reference sheet, cross-checked against public guides (Insider Gaming Droidex). Droid images are loaded from [droidtrakr.com](https://droidtrakr.com) and cached in the browser. This is a fan-made tool and is not affiliated with Epic Games or Lucasfilm.

## License

MIT — see [LICENSE](LICENSE).
