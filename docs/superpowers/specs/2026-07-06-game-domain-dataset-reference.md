# Droid Tycoon — Game Domain & Dataset Reference (Design Handoff)

- Created: 2026-07-06T15:25:31-07:00
- Audience: the Claude design session that owns this app's visual design (and the
  upcoming in-game overlay, spec 3)
- Companion to:
  - `2026-07-04-frontend-design-handoff.md` — app **UI conventions** (tier colors,
    interaction semantics, view inventory). Read that for *how the app should look/behave*.
  - `2026-07-03-platform-design.md` — engineering spec (routes, API, data shapes).
  - **This doc covers the third thing neither of those does: the *game itself*** — what
    Droid Tycoon is, how it plays, every entity and mechanic, and the complete current
    dataset. Read this if you have never played the game, or need real numbers to build
    realistic mockups.

## 0. How to use this document

You do not need to have played Droid Tycoon. Sections 1–3 get you fluent in the domain;
sections 4–6 define every entity, mechanic, and the data's *scale* (which drives layout
and chart decisions); section 7 is honest about data provenance and freshness; section 8
is the complete current dataset rendered as tables.

Two data provenances appear throughout, and they can diverge:

- **(A) App modeled data** — `app/drizzle/seed-data.json` + `app/src/lib/server/schema.ts`.
  Validated, de-corrupted, and what the app ships today. **Canonical for this handoff.**
- **(B) Live community sheet** — a public Google Sheet the community maintains, updated
  each game patch. The *source of truth going forward* (an auto-sync pipeline, spec 2, is
  planned to ingest it) and the origin of a few tables the app does not model yet. It also
  carries known human-entry corruption (see §7).

Where they differ, this doc flags it. Do not treat any single number as eternal — the
game is patched; the app labels its data with a "Data as of …" version indicator for
exactly this reason.

## 1. The game in one screen

**Star Wars: Droid Tycoon** is a *Fortnite* creative/island tycoon game. You build a droid
factory; droids you own passively generate **credits per second**. You spend credits to buy
more droids and level them up, chasing ever-larger income, and periodically **rebirth**
(a prestige reset) for permanent multipliers. It is an idle/incremental progression game
with a long collection meta-game layered on top.

**The core loop:**

1. **Earn** — owned droids generate credits/s continuously.
2. **Spend** — buy more droids; **upgrade** droids up *tiers* (Base → Beskar) using
   *Upgrade Chips* to raise their income.
3. **Rebirth** — once you hit a rebirth's gate (a **credit threshold** *and* owning
   **specific droids at specific tiers**), you rebirth: progress resets but you gain
   permanent **credit** and **XP multipliers**, unlock new droid slots/droids, and (from
   rebirth 12 on) earn **Nova Crystals**.
4. **Climb & cycle** — there are **27 rebirths**. Completing a lap triggers a
   **Super-Rebirth (SRB)**, and the *set of required droids cycles through 4 different
   paths* (1 → 2 → 3 → 4, path 1 being the original). So the same rebirth number asks for
   different droids depending on which cycle you're on.
5. **Meta-spend** — **Nova Crystals** buy permanent account upgrades in the **Nova Shop**
   and unlock cosmetic paints; **cosmetics** are long-tail achievement rewards.

**Why a tracker app exists:** players (the user plays with a friend group) need to know, at
a glance, *which droids and tiers they already own* versus *what the next rebirths demand* —
across 4 cycles × 27 rebirths, that's a lot of state to hold in your head. Every view in the
app serves some slice of "own vs. need."

## 2. The two axes everyone confuses — read this before designing anything

Droids are classified on **two orthogonal dimensions**. Conflating them is the single most
common domain mistake, and the UI handoff already builds a hard rule around keeping them
separate.

- **Tier — the *upgrade* axis** (a droid's current level). Five ordered steps:
  **Base → Gold → Diamond → Rainbow → Beskar.** You move a droid up this axis by spending
  Upgrade Chips. This is what the app **color-codes** (see UI handoff's tier tokens). Higher
  tier = higher income and higher sell value for that same droid.

- **Rarity — the *class* axis** (a droid's fixed grade). Six steps:
  **Common → Rare → Epic → Legendary → Mythic → Iconic.** Rarity is intrinsic to the droid,
  never changes, and determines *how expensive its tier upgrades are* (chip costs) and its
  *sell multipliers*. Rarity is deliberately **NOT** color-coded in the app — it's text
  metadata — precisely so it doesn't fight the tier colors.

A third, lesser dimension:

- **Type** — **Worker / Astromech / Battle.** Roughly even thirds of the roster. Early
  rebirths unlock a slot per type ("Worker Slot", "Astromech Slot", "Battle Slot"), and the
  ROI/reference views let you filter by type.

|Axis|Values (ordered)|Mutable?|Drives|Color-coded?|
|-|-|-|-|-|
|Tier|Base, Gold, Diamond, Rainbow, Beskar|Yes (via chips)|Income, sell value, requirements|**Yes**|
|Rarity|Common, Rare, Epic, Legendary, Mythic, Iconic|No|Chip costs, sell multipliers, Iconic special-casing|No (text only)|
|Type|Worker, Astromech, Battle|No|Slots, filtering|No (text/filter)|

## 3. Glossary

|Term|What it is|
|-|-|
|**Credits**|Primary in-game currency. Earned per-second by droids; spent to buy droids. Spans ~10³ to ~10¹³ — always abbreviated in UI (`10K`, `2.95M`, `32.00T`).|
|**Income**|A droid-tier's credit generation, expressed **per second** (`24/s`). Additive across owned droids.|
|**Upgrade Chips**|Currency for raising a droid one tier. Cost depends on the droid's *rarity* and which step. Shown with the bespoke chip glyph in the app.|
|**Nova Crystals (NC)**|Premium/meta currency. Earned from rebirths (12+). Spent in the Nova Shop, on Nova paints, and to unlock a couple of Iconic droids.|
|**Rebirth**|A prestige reset (27 of them per cycle). Gated by a credit threshold + specific droid ownership. Grants permanent multipliers + unlocks.|
|**Super-Rebirth (SRB)**|Completing a full rebirth lap; advances you to the next of the 4 requirement **cycles**.|
|**Tier / Rarity / Type**|The three classification axes — see §2.|
|**Flawless**|A rarer, "perfect" spawn of a droid. Spawn odds improve with tier (§5.5). Certain cosmetics require crafting N flawless droids; a Nova Shop "Flawless Charm" upgrade boosts odds.|
|**Counts-as**|Ownership rule: owning a droid at a *higher* tier satisfies any *lower*-tier requirement for it (a Beskar copy fulfills a Gold requirement). All "is it met?" logic uses this, not exact-tier match.|

## 4. Entity model (the "reference zone")

The app splits its schema into a **user zone** (player state — `users`, `profiles`,
`counts`, `plans`) and a **reference zone** (the game data below), with **no foreign keys
between them**. That boundary is deliberate: game data can be wholesale re-synced from the
sheet without touching a single player's saved progress. **Everything in this handoff lives
on the reference-zone side** — you are designing around static-ish game facts, not player
records.

Modeled reference tables (source: `schema.ts`, row counts from `seed-data.json`):

|Table|Grain|Columns|Rows|
|-|-|-|-|
|`droids`|one droid|name (PK), rarity, type|68|
|`droid_tiers`|droid × tier|droid, tier, buy, income, sell|340 (310 real + 30 Iconic-null)|
|`rebirth_reqs`|cycle × rebirth × required droid|cycle, rebirth, droid, tier, credits, unlock|324|
|`chip_costs`|rarity|rarity (PK), toGold, toDiamond, toRainbow, toBeskar|5|
|`rebirth_meta`|rebirth|rebirth (PK), nova, creditMult, xpMult|16 (rebirths 12–27)|
|`nova_shop`|category × item × level|category, item, level, cost|117|
|`cosmetics`|category × name|category, name, requirement|15|
|`data_versions`|ingest event|ingestedAt, source, checksum|provenance/version stamp|

**Unmodeled** tables that exist in the sheet but the app does not ingest yet (planned for
spec 2 — included in §8 for completeness): `droid_sell_values`, `flawless_spawn`,
`nova_paint_stages`, and Iconic-specific fields (income %/s and Nova-Crystal buy-in).

## 5. Mechanics in detail

### 5.1 Tiers & upgrading (chips)

A droid starts at **Base** and is upgraded one tier at a time, paying **Upgrade Chips**. The
per-step cost is set by the droid's **rarity**. To reach a target tier you pay the
**cumulative** sum of every step below it (the app's `cumChips` helper does exactly this):

- Common droid, Base → Beskar = 5 + 25 + 40 + 80 = **150 chips**.
- Epic droid, Base → Beskar = 120 + 180 + 240 + 5000 = **5,540 chips** (note the brutal
  final Rainbow → Beskar jump — a real design tension the app surfaces).

Chip cost grid (per rarity, per step). **Iconic droids have no tier grid — they are never
chip-upgraded (all N/A).**

|Rarity|Base → Gold|Gold → Diamond|Diamond → Rainbow|Rainbow → Beskar|
|-|-|-|-|-|
|Common|5|25|40|80|
|Rare|30|60|100|250|
|Epic|120|180|240|5,000|
|Legendary|400|1,200|4,000|12,000|
|Mythic|6,000|13,000|30,000|75,000|
|Iconic|N/A|N/A|N/A|N/A|

> **Freshness flag:** the app's *modeled* Mythic row is currently
> `8,000 / 15,000 / 40,000 / 80,000` — **stale** relative to the live sheet's
> `6,000 / 13,000 / 30,000 / 75,000` shown above. Every other rarity matches. This is a
> live example of the data drift the auto-sync spec exists to catch; the sheet value is the
> current-game truth.

### 5.2 Rebirth system

There are **27 rebirths**, replayed across **4 cycles** (the SRB paths). Each rebirth is
gated by:

- a **credit threshold** (grows from `10K` at rebirth 1 to `32.00T` at rebirth 27), and
- **~3 specific droid-at-tier requirements** you must own (via counts-as, §3).

Early rebirths also **unlock** something (a droid slot, a droid). Example (cycle 1):

- Rebirth 1 — threshold `10K`, unlocks **Worker Slot**, needs Base CB + Base PIT + Base DRK-1 PROBE.
- Rebirth 3 — threshold `975K`, unlocks **Battle Slot**, needs Base A-LT + Base BU-4D + **Gold** R9.
- Rebirth 27 — threshold `32.00T`, needs Diamond KX + Rainbow TRI-TEK + **Beskar** SNOW MOUSE.

Note how required tiers escalate deep into the run. The full 4-cycle requirement set is in
§8.2. The app's **planner** view lets a player select multiple upcoming rebirths and shows
the **combined** needs (max tier per droid across the selection — `combinedNeeds`).

**Rebirth rewards** kick in at **rebirth 12** and scale up (`rebirth_meta`): each grants
**Nova Crystals** plus permanent **credit** and **XP** multipliers.

|Rebirth|Nova Crystals|Credit mult|XP mult|
|-|-|-|-|
|12|11|+22%|+110%|
|13|16|+32%|+160%|
|14|22|+44%|+220%|
|15|29|+58%|+290%|
|16|37|+74%|+370%|
|17|46|+92%|+460%|
|18|56|+112%|+560%|
|19|67|+134%|+670%|
|20|79|+158%|+790%|
|21|92|+184%|+920%|
|22|106|+212%|+1060%|
|23|121|+242%|+1210%|
|24|137|+274%|+1370%|
|25|154|+308%|+1540%|
|26|172|+344%|+1720%|
|27|191|+382%|+1910%|

### 5.3 Income & ROI

Income is **per second** and additive. The app derives a **payback time** per droid-tier —
`paybackSeconds = buy ÷ income` — and an `incomePer1k` efficiency figure, then sorts droids
by fastest payback (the `roi` module, feeding the `/roi` view).

**Design-critical:** buy cost spans **950 → ~273.6 billion** and income **2/s → 139,000/s** —
roughly **8–9 orders of magnitude** on the cost axis alone. Any cost-vs-income scatter
**must** use **log-log axes**
(the UI handoff makes this a hard constraint); linear axes render the plot useless.

### 5.4 Sell values

Two distinct "sell" concepts exist — keep them straight:

- **Modeled per-tier sell** (`droid_tiers.sell`): an absolute credit value, currently
  `≈ 0.70 × buy` for that tier (e.g. MOUSE Gold: buy 3,800 → sell 2,660). This is the value
  in §8.1.
- **Sheet "sell value multiplier" grid** (`droid_sell_values`, unmodeled): a per-**rarity ×
  tier** integer multiplier (below). Its exact unit is **not fully pinned** in recon — treat
  it as a relative grid, not an absolute credit amount. Base tier is absent; Iconic is N/A.

|Rarity|Gold|Diamond|Rainbow|Beskar|
|-|-|-|-|-|
|Common|4|7|10|13|
|Rare|6|9|12|15|
|Epic|30|33|36|39|
|Legendary|84|87|90|93|
|Mythic|192|195|198|201|
|Iconic|N/A|N/A|N/A|N/A|

### 5.5 Flawless spawns

A "flawless" spawn is a rarer, better version of a droid. Odds are **1-in-N** and improve as
tier rises. Some cosmetics gate on crafting N flawless droids; the Nova Shop's "Flawless
Charm" upgrade improves odds. (`flawless_spawn`, unmodeled.)

|Tier|Odds|
|-|-|
|Base (Default)|1 / 1000|
|Gold|1 / 500|
|Diamond|1 / 250|
|Rainbow|1 / 125|
|Beskar|1 / 100|

### 5.6 Nova Shop & Nova Crystals

**Nova Crystals** (earned from rebirths 12+, §5.2) buy **permanent account upgrades**, each a
multi-level ladder with rising crystal cost. Two modeled categories:

- **Core upgrades:** Max Health, Damage, Credits, Flawless Charm, Movement Speed, Double
  Daily Quests, Pickaxe Mastery, Jawa Bartering, Super Crates.
- **Workshop upgrades:** Lounge Slot, Upgrade Chip Scrap, Scrap Value, Blueprint Scrap,
  Crafting Speed, Blueprint Storage, Collect All, Rebirth Droid Alert, Blueprint Vendor.

Full per-level cost ladders are in §8.3. Nova Crystals also buy **base paints** in stages
(`nova_paint_stages`, unmodeled): Stage 1 = **30**, Stage 2 = **+120**, Stage 3 = **+400**
crystals.

### 5.7 Cosmetics

Long-tail, achievement-gated rewards (paints, hats, ring challenges). Not tied to the core
economy — pure collection goals. All 15 modeled entries:

|Cosmetic|Requirement|
|-|-|
|Blue Paint|Rebirth 1 time|
|Gold Paint|Rebirth 5 times|
|Diamond Paint|Rebirth 10 times|
|Rainbow Paint|Rebirth 15 times|
|Worker Green|Craft 100 droids|
|Battle Orange|Craft 250 droids|
|Astromech Purple|Craft 500 droids|
|Flawless Paint|Craft 15 flawless droids|
|Super Flawless|Craft 50 flawless droids|
|Beskar Paint|Collect 25 different Beskar droids|
|Super Beskar|Collect 50 different Beskar droids|
|Nova Stage 1/2/3|30 / +120 / +400 nova crystals|
|Ringmaster|Fly through every yellow ring|
|Adv. Ringmaster|Fly through every orange ring|
|Hats (16)|Find in world / events|

### 5.8 Iconic droids (the special case)

The 6 **Iconic** droids break the normal model and need bespoke design treatment:

- **No tier grid** — they are never chip-upgraded (their `droid_tiers` rows are all null,
  which is where the 30 null economic rows come from).
- Income is a **percentage per second** (`%/s`), not a flat credit figure — a different unit
  from every other droid. Model target: a droid-level `income_pct` field.
- Most are unlocked by other means; **CB-23 costs 75 Nova Crystals** (a droid-level `buy_nc`
  field), the only droid bought with the premium currency.

|Iconic|Type|Income|Buy-in|
|-|-|-|-|
|BB8|Astromech|15%/s|—|
|Mister Bones|Battle|15%/s|—|
|IG-11 Marshal|Battle|15%/s|—|
|DJ-R3X|Worker|15%/s|—|
|CB-23|Astromech|15%/s|75 Nova Crystals|
|R2-D2|Astromech|25%/s|—|

## 6. Data scale & display conventions (cheat-sheet for layout/charts)

|Quantity|Min|Max|Notes|
|-|-|-|-|
|Droid buy cost (credits)|950|~273,600,000,000|~8–9 orders of magnitude|
|Droid income (credits/s)|2|139,000|per-second; iconics are %/s instead|
|Rebirth credit threshold|10K|32.00T|stored as display text|
|Chip cost (single step)|5|75,000|integer counts, chip glyph|
|Nova Crystal cost (shop)|1|~295|small integers|
|Roster|68 droids|—|11 C / 14 R / 18 E / 8 L / 11 M / 6 Iconic|

Conventions the app already relies on (see UI handoff for the full list):

- **Abbreviate large numbers** — `K`, `M`, `T` (credits span 10³–10¹³). Do not print raw
  digit strings for credits.
- **Income is per-second** (`24/s`); **chips** use the chip glyph; **Nova Crystals** get
  their own accent color.
- Tier is the **color language**; rarity/type are text/filters.
- A discreet **"Data as of …"** version indicator belongs somewhere unobtrusive — the whole
  dataset is versioned because it drifts with patches.

## 7. Data provenance & freshness — read before trusting a number

- **Canonical = app modeled data** (§ tables from `seed-data.json`). It's validated and
  de-corrupted; it's what the running app shows.
- **Source of truth going forward = the live sheet.** An auto-sync pipeline (spec 2, drafted
  but not yet implemented) will ingest it behind a **diff-and-approve** gate. Until then, the
  app data can lag the sheet by a patch.
- **Known divergence:** modeled **Mythic chip costs are stale** (§5.1).
- **Known corruption in the live sheet:** at least one droid ("IG") has anomalous economic
  values (Base ≈ 228M, Gold ≈ 1.37B — wildly out of family); the planned validator *holds*
  such rows rather than importing them. Don't design around outlier numbers you can't
  sanity-check.
- **Unmodeled tables** (§5.4, §5.5, §5.6, §5.8 extras) are transcribed here from sheet recon;
  their column semantics are mostly pinned but a couple (sell-value unit) are approximate —
  flagged inline.
- The community art/data ecosystem lives at **droidtrakr.com** (the UI handoff documents the
  droid-art asset pattern and attribution).

## 8. Complete current dataset

Everything below is generated directly from `app/drizzle/seed-data.json` (canonical modeled
data) plus the unmodeled sheet tables shown inline above. For a machine-readable copy, that
JSON file *is* the dataset.

<!-- BEGIN GENERATED DATA -->

### 8.1 Droid roster & economics (all 68 droids × 5 tiers)

Iconic droids show `—` (no tier grid — see §5.8 for their %/s income). Grouped by rarity.

#### Buy cost (credits)

|Droid|Rarity|Type|Base|Gold|Diamond|Rainbow|Beskar|
|-|-|-|-|-|-|-|-|
|MOUSE|Common|Worker|950|3,800|7,600|11,400|15,200|
|PIT|Common|Worker|1,100|4,400|8,800|13,200|17,600|
|GONK|Common|Worker|3,000|12,000|24,000|36,000|48,000|
|CB|Common|Astromech|2,000|8,000|16,000|24,000|32,000|
|R3|Common|Astromech|2,000|8,000|16,000|24,000|32,000|
|R5|Common|Astromech|2,000|8,000|16,000|24,000|32,000|
|R8|Common|Astromech|3,000|12,000|24,000|36,000|48,000|
|IMPERIAL PROBE|Common|Battle|5,000|20,000|40,000|60,000|80,000|
|B1 BATTLE|Common|Battle|4,000|16,000|32,000|48,000|64,000|
|DRK-1 PROBE|Common|Battle|3,000|12,000|24,000|36,000|48,000|
|ID10|Common|Battle|4,000|16,000|32,000|48,000|64,000|
|BDX EXPLORER|Rare|Worker|25,000|100,000|200,000|300,000|400,000|
|ARG|Rare|Worker|88,000|352,000|704,000|1,060,000|1,410,000|
|SENATE HOVERCAM|Rare|Worker|100,000|400,000|800,000|1,200,000|1,600,000|
|BU-4D|Rare|Worker|130,000|520,000|1,040,000|1,560,000|2,080,000|
|BAL-CORE|Rare|Worker|43,000|172,000|344,000|516,000|688,000|
|ROLL-R|Rare|Worker|62,000|248,000|496,000|744,000|992,000|
|2BB|Rare|Astromech|30,000|120,000|240,000|360,000|480,000|
|A-LT|Rare|Astromech|74,000|296,000|592,000|885,000|1,180,000|
|R4|Rare|Astromech|110,000|440,000|880,000|1,320,000|1,760,000|
|R9|Rare|Astromech|120,000|480,000|960,000|1,440,000|1,920,000|
|B1 SECURITY|Rare|Battle|150,000|600,000|1,200,000|1,800,000|2,400,000|
|NAV-EX|Rare|Battle|36,000|144,000|288,000|432,000|576,000|
|VECT-ARM|Rare|Battle|52,000|208,000|416,000|624,000|832,000|
|HOV-R|Rare|Battle|140,000|560,000|1,120,000|1,680,000|2,240,000|
|GROUNDMECH|Epic|Worker|900,000|3,600,000|7,200,000|10,800,000|112,500,000|
|LO|Epic|Worker|2,100,000|8,400,000|16,800,000|25,200,000|262,500,000|
|AMP WALKER|Epic|Worker|5,400,000|21,600,000|43,200,000|64,800,000|675,000,000|
|SEN-TRI|Epic|Worker|4,800,000|19,200,000|38,400,000|57,600,000|600,000,000|
|OPTI-POD|Epic|Worker|3,600,000|14,400,000|28,800,000|43,200,000|450,000,000|
|BB|Epic|Astromech|1,200,000|4,800,000|9,600,000|14,400,000|150,000,000|
|R2|Epic|Astromech|3,300,000|13,200,000|26,400,000|39,600,000|412,500,000|
|R6|Epic|Astromech|2,700,000|10,800,000|21,600,000|32,400,000|337,500,000|
|TRAK-R|Epic|Astromech|3,000,000|12,000,000|24,000,000|36,000,000|375,000,000|
|ORB-WALKER|Epic|Astromech|1,500,000|6,000,000|12,000,000|18,000,000|187,500,000|
|GUNRUNNER|Epic|Worker|6,300,000|25,200,000|50,400,000|75,600,000|787,500,000|
|UTIL-TEC|Epic|Astromech|1,800,000|7,200,000|14,400,000|21,600,000|225,000,000|
|B1 HEAVY|Epic|Battle|6,000,000|24,000,000|48,000,000|72,000,000|750,000,000|
|B2 SUPER|Epic|Battle|3,900,000|15,600,000|31,200,000|46,800,000|487,500,000|
|B2 HEAVY|Epic|Battle|4,500,000|18,000,000|36,000,000|54,000,000|562,500,000|
|STRIKE-ORB|Epic|Battle|5,100,000|20,400,000|40,800,000|61,200,000|637,500,000|
|HAUL-R|Epic|Battle|2,400,000|9,600,000|19,200,000|28,800,000|300,000,000|
|LNG-SHOT|Epic|Battle|4,200,000|16,800,000|33,600,000|50,400,000|525,000,000|
|PROTO-ROLLER|Legendary|Worker|22,000,000|88,000,000|176,000,000|264,000,000|8,800,000,000|
|MECHA-DROID|Legendary|Worker|29,000,000|116,000,000|232,000,000|348,000,000|11,600,000,000|
|MONO-WLKR|Legendary|Worker|37,000,000|148,000,000|296,000,000|444,000,000|14,800,000,000|
|BB9|Legendary|Astromech|28,000,000|112,000,000|224,000,000|336,000,000|11,200,000,000|
|R7|Legendary|Astromech|37,000,000|148,000,000|296,000,000|444,000,000|14,800,000,000|
|B2-RP|Legendary|Battle|31,000,000|124,000,000|248,000,000|372,000,000|12,400,000,000|
|CYCLO-GRAV|Legendary|Battle|30,000,000|120,000,000|240,000,000|360,000,000|12,000,000,000|
|OPTI-STRK|Legendary|Battle|37,000,000|148,000,000|296,000,000|444,000,000|14,800,000,000|
|SNOW MOUSE|Mythic|Worker|180,000,000|720,000,000|1,420,000,000|4,320,000,000|144,000,000,000|
|RIC|Mythic|Worker|204,000,000|912,000,000|1,630,000,000|4,900,000,000|163,200,000,000|
|LOADLIFTER|Mythic|Worker|300,000,000|1,200,000,000|2,400,000,000|7,200,000,000|240,000,000,000|
|LEP|Mythic|Worker|252,000,000|1,010,000,000|2,020,000,000|6,050,000,000|201,600,000,000|
|RIC-1200|Mythic|Worker|228,000,000|912,000,000|1,810,000,000|5,470,000,000|182,400,000,000|
|DRFT-R|Mythic|Astromech|228,000,000|912,000,000|1,810,000,000|5,470,000,000|182,400,000,000|
|CYCLENS|Mythic|Astromech|180,000,000|720,000,000|1,420,000,000|4,320,000,000|144,000,000,000|
|MO-TRAK|Mythic|Astromech|300,000,000|1,200,000,000|2,400,000,000|7,200,000,000|240,000,000,000|
|TRI-TEK|Mythic|Astromech|252,000,000|1,010,000,000|2,020,000,000|6,050,000,000|201,600,000,000|
|IG|Mythic|Battle|342,000,000|1,370,000,000|2,740,000,000|5,470,000,000|273,600,000,000|
|KX|Mythic|Battle|300,000,000|1,200,000,000|2,400,000,000|7,200,000,000|240,000,000,000|
|BB8|Iconic|Astromech|—|—|—|—|—|
|MISTER BONES|Iconic|Battle|—|—|—|—|—|
|IG-11 MARSHAL|Iconic|Battle|—|—|—|—|—|
|DJ-R3X|Iconic|Worker|—|—|—|—|—|
|CB-23|Iconic|Astromech|—|—|—|—|—|
|R2-D2|Iconic|Astromech|—|—|—|—|—|


#### Income (credits/second)

|Droid|Rarity|Type|Base|Gold|Diamond|Rainbow|Beskar|
|-|-|-|-|-|-|-|-|
|MOUSE|Common|Worker|2|4|8|16|24|
|PIT|Common|Worker|2|4|8|16|24|
|GONK|Common|Worker|4|8|16|32|48|
|CB|Common|Astromech|3|6|12|24|36|
|R3|Common|Astromech|3|6|12|24|36|
|R5|Common|Astromech|3|6|12|24|36|
|R8|Common|Astromech|4|8|16|32|48|
|IMPERIAL PROBE|Common|Battle|6|12|24|48|72|
|B1 BATTLE|Common|Battle|5|10|20|40|60|
|DRK-1 PROBE|Common|Battle|3|6|12|24|36|
|ID10|Common|Battle|4|8|16|32|48|
|BDX EXPLORER|Rare|Worker|15|30|60|120|180|
|ARG|Rare|Worker|42|84|168|336|504|
|SENATE HOVERCAM|Rare|Worker|46|92|184|368|552|
|BU-4D|Rare|Worker|58|116|232|464|696|
|BAL-CORE|Rare|Worker|23|46|92|184|276|
|ROLL-R|Rare|Worker|31|62|124|248|372|
|2BB|Rare|Astromech|17|34|68|136|204|
|A-LT|Rare|Astromech|36|72|144|288|432|
|R4|Rare|Astromech|50|100|200|400|600|
|R9|Rare|Astromech|54|108|216|432|648|
|B1 SECURITY|Rare|Battle|66|132|264|528|792|
|NAV-EX|Rare|Battle|18|36|72|144|216|
|VECT-ARM|Rare|Battle|27|54|108|216|324|
|HOV-R|Rare|Battle|62|124|248|496|774|
|GROUNDMECH|Epic|Worker|120|240|480|960|4,080|
|LO|Epic|Worker|240|480|960|1,920|8,160|
|AMP WALKER|Epic|Worker|570|1,140|2,280|4,560|19,380|
|SEN-TRI|Epic|Worker|510|1,020|2,040|4,080|17,340|
|OPTI-POD|Epic|Worker|390|780|1,560|3,120|13,260|
|BB|Epic|Astromech|150|300|600|1,200|5,100|
|R2|Epic|Astromech|360|720|1,440|2,880|12,240|
|R6|Epic|Astromech|300|600|1,200|2,400|10,200|
|TRAK-R|Epic|Astromech|330|660|1,320|2,640|11,220|
|ORB-WALKER|Epic|Astromech|180|360|720|1,440|6,120|
|GUNRUNNER|Epic|Worker|660|1,320|2,640|5,280|22,440|
|UTIL-TEC|Epic|Astromech|210|420|840|1,680|7,140|
|B1 HEAVY|Epic|Battle|630|1,260|2,520|4,800|20,400|
|B2 SUPER|Epic|Battle|420|840|1,680|3,360|14,280|
|B2 HEAVY|Epic|Battle|480|960|1,920|3,840|16,320|
|STRIKE-ORB|Epic|Battle|540|1,080|2,160|4,320|18,360|
|HAUL-R|Epic|Battle|270|540|1,080|2,160|9,180|
|LNG-SHOT|Epic|Battle|450|900|1,800|3,600|15,300|
|PROTO-ROLLER|Legendary|Worker|972|1,940|3,890|7,780|23,330|
|MECHA-DROID|Legendary|Worker|1,240|2,490|4,970|9,950|29,860|
|MONO-WLKR|Legendary|Worker|1,500|3,000|6,000|12,000|36,000|
|BB9|Legendary|Astromech|1,300|2,600|5,200|10,400|31,200|
|R7|Legendary|Astromech|1,500|3,000|6,000|12,000|36,000|
|B2-RP|Legendary|Battle|1,300|2,600|5,210|10,430|31,300|
|CYCLO-GRAV|Legendary|Battle|1,260|2,520|5,040|10,080|30,240|
|OPTI-STRK|Legendary|Battle|1,500|3,000|6,000|12,000|36,000|
|SNOW MOUSE|Mythic|Worker|4,400|8,800|17,600|35,200|70,400|
|RIC|Mythic|Worker|5,100|11,600|20,400|40,800|81,600|
|LOADLIFTER|Mythic|Worker|7,200|14,400|28,800|57,600|115,200|
|LEP|Mythic|Worker|6,500|13,000|26,000|52,000|104,000|
|RIC-1200|Mythic|Worker|5,800|11,600|23,200|46,400|92,800|
|DRFT-R|Mythic|Astromech|5,800|11,600|23,200|46,400|92,800|
|CYCLENS|Mythic|Astromech|4,400|8,800|17,600|35,200|70,400|
|MO-TRAK|Mythic|Astromech|7,200|14,400|28,800|57,600|115,200|
|TRI-TEK|Mythic|Astromech|6,500|13,000|26,000|52,000|104,000|
|IG|Mythic|Battle|6,700|17,400|34,800|46,400|139,000|
|KX|Mythic|Battle|7,200|14,400|28,800|57,600|115,200|
|BB8|Iconic|Astromech|—|—|—|—|—|
|MISTER BONES|Iconic|Battle|—|—|—|—|—|
|IG-11 MARSHAL|Iconic|Battle|—|—|—|—|—|
|DJ-R3X|Iconic|Worker|—|—|—|—|—|
|CB-23|Iconic|Astromech|—|—|—|—|—|
|R2-D2|Iconic|Astromech|—|—|—|—|—|


#### Sell value (credits)

|Droid|Rarity|Type|Base|Gold|Diamond|Rainbow|Beskar|
|-|-|-|-|-|-|-|-|
|MOUSE|Common|Worker|665|2,660|5,320|7,980|10,640|
|PIT|Common|Worker|770|3,080|6,160|9,240|12,320|
|GONK|Common|Worker|2,100|8,400|16,800|25,200|33,600|
|CB|Common|Astromech|1,400|5,600|11,200|16,800|22,400|
|R3|Common|Astromech|1,400|5,600|11,200|16,800|22,400|
|R5|Common|Astromech|1,400|5,600|11,200|16,800|22,400|
|R8|Common|Astromech|2,100|8,400|16,800|25,200|33,600|
|IMPERIAL PROBE|Common|Battle|3,500|14,000|28,000|42,000|56,000|
|B1 BATTLE|Common|Battle|2,800|11,200|22,400|33,600|44,800|
|DRK-1 PROBE|Common|Battle|2,100|8,400|16,800|25,200|33,600|
|ID10|Common|Battle|2,800|11,200|22,400|33,600|44,800|
|BDX EXPLORER|Rare|Worker|17,500|70,000|140,000|210,000|280,000|
|ARG|Rare|Worker|61,600|246,400|492,800|739,200|985,600|
|SENATE HOVERCAM|Rare|Worker|70,000|280,000|560,000|840,000|1,120,000|
|BU-4D|Rare|Worker|91,000|364,000|728,000|1,100,000|1,450,000|
|BAL-CORE|Rare|Worker|30,100|120,400|240,800|361,200|481,600|
|ROLL-R|Rare|Worker|43,400|173,600|347,200|520,800|694,400|
|2BB|Rare|Astromech|21,000|84,000|168,000|252,000|336,000|
|A-LT|Rare|Astromech|51,800|207,200|414,400|621,600|828,800|
|R4|Rare|Astromech|77,000|308,000|616,000|922,500|1,230,000|
|R9|Rare|Astromech|84,000|336,000|672,000|1,000,000|1,340,000|
|B1 SECURITY|Rare|Battle|105,000|420,000|840,000|1,260,000|1,680,000|
|NAV-EX|Rare|Battle|25,200|100,800|201,600|302,400|403,200|
|VECT-ARM|Rare|Battle|36,400|145,600|291,200|436,800|582,400|
|HOV-R|Rare|Battle|98,000|392,000|784,000|1,180,000|1,560,000|
|GROUNDMECH|Epic|Worker|630,000|2,520,000|5,040,000|7,560,000|78,750,000|
|LO|Epic|Worker|1,470,000|5,880,000|11,760,000|17,640,000|183,750,000|
|AMP WALKER|Epic|Worker|3,780,000|15,120,000|30,240,000|45,360,000|472,500,000|
|SEN-TRI|Epic|Worker|3,360,000|13,440,000|26,880,000|40,320,000|420,000,000|
|OPTI-POD|Epic|Worker|2,520,000|10,080,000|20,160,000|30,240,000|315,000,000|
|BB|Epic|Astromech|840,000|3,360,000|6,720,000|10,080,000|105,000,000|
|R2|Epic|Astromech|2,310,000|9,240,000|18,480,000|27,720,000|288,750,000|
|R6|Epic|Astromech|1,890,000|7,560,000|15,120,000|22,680,000|236,250,000|
|TRAK-R|Epic|Astromech|2,100,000|8,400,000|16,800,000|25,200,000|262,500,000|
|ORB-WALKER|Epic|Astromech|1,050,000|4,200,000|8,400,000|12,600,000|131,250,000|
|GUNRUNNER|Epic|Worker|4,410,000|17,640,000|35,280,000|52,920,000|551,250,000|
|UTIL-TEC|Epic|Astromech|1,260,000|5,040,000|10,080,000|15,120,000|157,500,000|
|B1 HEAVY|Epic|Battle|4,200,000|16,800,000|33,600,000|50,400,000|525,000,000|
|B2 SUPER|Epic|Battle|2,730,000|10,920,000|21,840,000|32,760,000|341,250,000|
|B2 HEAVY|Epic|Battle|3,150,000|12,600,000|25,200,000|37,800,000|393,750,000|
|STRIKE-ORB|Epic|Battle|3,570,000|14,280,000|28,560,000|42,840,000|446,250,000|
|HAUL-R|Epic|Battle|1,680,000|6,720,000|13,440,000|20,160,000|210,000,000|
|LNG-SHOT|Epic|Battle|2,940,000|11,760,000|23,520,000|35,280,000|367,500,000|
|PROTO-ROLLER|Legendary|Worker|15,400,000|61,600,000|123,200,000|184,800,000|6,160,000,000|
|MECHA-DROID|Legendary|Worker|20,300,000|81,200,000|162,400,000|243,600,000|8,120,000,000|
|MONO-WLKR|Legendary|Worker|25,900,000|103,600,000|207,200,000|310,800,000|10,360,000,000|
|BB9|Legendary|Astromech|19,600,000|78,400,000|156,800,000|235,200,000|7,840,000,000|
|R7|Legendary|Astromech|25,900,000|103,600,000|207,200,000|310,800,000|10,360,000,000|
|B2-RP|Legendary|Battle|21,700,000|86,800,000|173,600,000|260,400,000|8,680,000,000|
|CYCLO-GRAV|Legendary|Battle|21,000,000|84,000,000|168,000,000|252,000,000|8,400,000,000|
|OPTI-STRK|Legendary|Battle|25,900,000|103,600,000|207,200,000|310,800,000|10,360,000,000|
|SNOW MOUSE|Mythic|Worker|126,000,000|504,000,000|1,000,000,000|3,020,000,000|100,800,000,000|
|RIC|Mythic|Worker|142,800,000|638,400,000|1,140,000,000|3,430,000,000|114,240,000,000|
|LOADLIFTER|Mythic|Worker|210,000,000|840,000,000|1,680,000,000|5,040,000,000|168,000,000,000|
|LEP|Mythic|Worker|176,400,000|705,600,000|1,410,000,000|4,230,000,000|141,120,000,000|
|RIC-1200|Mythic|Worker|159,600,000|638,400,000|1,270,000,000|3,820,000,000|127,680,000,000|
|DRFT-R|Mythic|Astromech|159,600,000|638,400,000|1,270,000,000|3,820,000,000|127,680,000,000|
|CYCLENS|Mythic|Astromech|126,000,000|504,000,000|1,000,000,000|3,020,000,000|100,800,000,000|
|MO-TRAK|Mythic|Astromech|210,000,000|840,000,000|1,680,000,000|5,040,000,000|168,000,000,000|
|TRI-TEK|Mythic|Astromech|176,400,000|705,600,000|1,410,000,000|4,230,000,000|141,120,000,000|
|IG|Mythic|Battle|239,400,000|959,000,000|1,910,000,000|3,820,000,000|191,520,000,000|
|KX|Mythic|Battle|210,000,000|840,000,000|1,680,000,000|5,040,000,000|168,000,000,000|
|BB8|Iconic|Astromech|—|—|—|—|—|
|MISTER BONES|Iconic|Battle|—|—|—|—|—|
|IG-11 MARSHAL|Iconic|Battle|—|—|—|—|—|
|DJ-R3X|Iconic|Worker|—|—|—|—|—|
|CB-23|Iconic|Astromech|—|—|—|—|—|
|R2-D2|Iconic|Astromech|—|—|—|—|—|


### 8.2 Rebirth requirements (4 cycles × 27 rebirths = 324 rows)

Each rebirth lists its credit threshold, the droids-at-tier you must own (counts-as applies), and what completing it unlocks. Blank credits/unlock = inherited/none.

#### Cycle 1 (original path)

|Rebirth|Credits|Required droids (tier)|Unlocks|
|-|-|-|-|
|1|10K|Base CB · Base PIT · Base DRK-1 PROBE|Worker Slot|
|2|150K|Base BDX EXPLORER · Base 2BB · Base BAL-CORE|Astromech Slot|
|3|975K|Base A-LT · Base BU-4D · Gold R9|Battle Slot|
|4|2.95M|Gold ARG · Gold B1 SECURITY · Base GROUNDMECH|Worker Slot|
|5|5.35M|Gold BU-4D · Gold HOV-R · Diamond R9|Astromech Slot|
|6|9.85M|Diamond A-LT · Diamond ARG · Gold GROUNDMECH|Battle Slot|
|7|14.5M|Diamond BU-4D · Diamond B1 SECURITY · Gold BB|Worker Slot|
|8|36M|Diamond HOV-R · Gold LO · Gold UTIL-TEC|Astromech Slot|
|9|89M|Gold TRAK-R · Gold R6 · Rainbow GROUNDMECH|Battle Slot|
|10|220M|Gold STRIKE-ORB · Rainbow HAUL-R · Rainbow LO|Worker Slot|
|11|550M|Rainbow AMP WALKER · Rainbow B1 HEAVY · Base BB9|Astromech Slot|
|12|1.36B|Gold PROTO-ROLLER · Base MECHA-DROID · Base MONO-WLKR|Worker Slot|
|13|3.40B|Base R7 · Base CYCLO-GRAV · Base B2-RP|Astromech Slot|
|14|8.45B|Base OPTI-STRK · Gold MONO-WLKR · Gold MECHA-DROID|Worker Slot|
|15|21.00B|Gold B2-RP · Gold BB9 · Gold R7|Astromech Slot|
|16|52.00B|Gold OPTI-STRK · Diamond MONO-WLKR · Diamond PROTO-ROLLER|Worker Slot|
|17|130.00B|Diamond B2-RP · Diamond CYCLO-GRAV · Diamond MECHA-DROID|Lounge Slot|
|18|325.00B|Diamond BB9 · Diamond R7 · Rainbow MONO-WLKR|Lounge Slot|
|19|810.00B|Rainbow B2-RP · Rainbow CYCLO-GRAV · Rainbow PROTO-ROLLER|Lounge Slot|
|20|2.00T|Rainbow R7 · Rainbow OPTI-STRK · Rainbow MECHA-DROID|Lounge Slot|
|21|3.00T|Beskar BB · Beskar ORB-WALKER · Beskar GROUNDMECH|None|
|22|4.50T|Beskar AMP WALKER · Beskar B1 HEAVY · Beskar PROTO-ROLLER|None|
|23|6.00T|Beskar OPTI-STRK · Beskar MONO-WLKR · Beskar R7|None|
|24|9.00T|Beskar BB9 · Beskar CYCLO-GRAV · Base MO-TRAK||
|25|13.50T|Beskar B2-RP · Base IG · Gold DRFT-R||
|26|21.00T|Gold CYCLENS · Diamond LOADLIFTER · Rainbow RIC-1200||
|27|32.00T|Diamond KX · Rainbow TRI-TEK · Beskar SNOW MOUSE||

#### Cycle 2

|Rebirth|Credits|Required droids (tier)|Unlocks|
|-|-|-|-|
|1|10K|Base ID10 · Base MOUSE · Base GONK||
|2|150K|Base ROLL-R · Base SENATE HOVERCAM · Base NAV-EX||
|3|975K|Base R4 · Base VECT-ARM · Gold BDX EXPLORER||
|4|2.95M|Gold 2BB · Gold BAL-CORE · Base ORB-WALKER||
|5|5.35M|Gold R4 · Gold VECT-ARM · Gold NAV-EX||
|6|9.85M|Base GUNRUNNER · Diamond 2BB · Diamond BAL-CORE||
|7|14.5M|Diamond ROLL-R · Diamond BDX EXPLORER · Gold R2||
|8|36M|Diamond R4 · Gold B2 SUPER · Gold GUNRUNNER||
|9|89M|Rainbow NAV-EX · Gold STRIKE-ORB · Gold AMP WALKER||
|10|220M|Rainbow VECT-ARM · Diamond R2 · Diamond B2 SUPER||
|11|550M|Diamond STRIKE-ORB · Diamond B2 HEAVY · Rainbow BAL-CORE||
|12|1.36B|Rainbow ORB-WALKER · Rainbow R2 · Base BB9||
|13|3.40B|Rainbow B2 SUPER · Base MECHA-DROID · Base PROTO-ROLLER||
|14|8.45B|Rainbow B2 HEAVY · Base B2-RP · Gold R7||
|15|21.00B|Rainbow STRIKE-ORB · Gold BB9 · Gold PROTO-ROLLER||
|16|52.00B|Rainbow AMP WALKER · Gold MECHA-DROID · Diamond B2-RP||
|17|130.00B|Rainbow OPTI-POD · Gold MONO-WLKR · Diamond R7||
|18|325.00B|Rainbow UTIL-TEC · Diamond BB9 · Diamond PROTO-ROLLER||
|19|810.00B|Diamond MECHA-DROID · Rainbow R7 · Rainbow B2-RP||
|20|2.00T|Rainbow MONO-WLKR · Rainbow OPTI-STRK · Rainbow CYCLO-GRAV||
|21|3.00T|Beskar LO · Beskar R6 · Beskar HAUL-R||
|22|4.50T|Beskar SEN-TRI · Beskar STRIKE-ORB · Beskar PROTO-ROLLER||
|23|6.00T|Beskar BB9 · Beskar CYCLO-GRAV · Beskar B2-RP||
|24|9.00T|Beskar OPTI-STRK · Beskar B2-RP · Base SNOW MOUSE||
|25|13.50T|Beskar MONO-WLKR · Gold TRI-TEK · Base RIC-1200||
|26|21.00T|Gold KX · Diamond DRFT-R · Rainbow IG||
|27|32.00T|Diamond LEP · Rainbow LOADLIFTER · Beskar MO-TRAK||

#### Cycle 3

|Rebirth|Credits|Required droids (tier)|Unlocks|
|-|-|-|-|
|1|10K|Base MOUSE · Base PIT · Base GONK||
|2|150K|Base R3 · Base 2BB · Base SENATE HOVERCAM||
|3|975K|Base R8 · Base R5 · Base R4||
|4|2.95M|Gold B1 BATTLE · Gold R9 · Gold B1 SECURITY||
|5|5.35M|Gold R3 · Gold 2BB · Gold SENATE HOVERCAM||
|6|9.85M|Diamond R5 · Diamond R4 · Diamond BDX EXPLORER||
|7|14.5M|Diamond R8 · Diamond B1 BATTLE · Diamond R9||
|8|36M|Rainbow R3 · Rainbow B1 SECURITY · Rainbow 2BB||
|9|89M|Rainbow R5 · Rainbow R4 · Rainbow BDX EXPLORER||
|10|220M|Rainbow SENATE HOVERCAM · Base GROUNDMECH · Base TRAK-R||
|11|550M|Base B2 HEAVY · Base B2 SUPER · Base UTIL-TEC||
|12|1.36B|Rainbow BAL-CORE · Gold GROUNDMECH · Gold TRAK-R||
|13|3.40B|Rainbow B2 SUPER · Base MECHA-DROID · Base PROTO-ROLLER||
|14|8.45B|Rainbow B2 HEAVY · Base B2-RP · Gold R7||
|15|21.00B|Rainbow STRIKE-ORB · Gold BB9 · Gold PROTO-ROLLER||
|16|52.00B|Rainbow AMP WALKER · Gold MECHA-DROID · Diamond B2-RP||
|17|130.00B|Rainbow OPTI-POD · Gold MONO-WLKR · Diamond R7||
|18|325.00B|Rainbow UTIL-TEC · Diamond BB9 · Diamond PROTO-ROLLER||
|19|810.00B|Diamond MECHA-DROID · Rainbow R7 · Rainbow B2-RP||
|20|2.00T|Rainbow MONO-WLKR · Rainbow OPTI-STRK · Rainbow CYCLO-GRAV||
|21|3.00T|Beskar B2 SUPER · Beskar OPTI-POD · Beskar R2||
|22|4.50T|Beskar GUNRUNNER · Beskar LNG-SHOT · Beskar B2-RP||
|23|6.00T|Beskar MONO-WLKR · Beskar CYCLO-GRAV · Beskar MECHA-DROID||
|24|9.00T|Beskar BB9 · Beskar B2-RP · Base RIC||
|25|13.50T|Beskar PROTO-ROLLER · Base LOADLIFTER · Gold MO-TRAK||
|26|21.00T|Gold LEP · Diamond TRI-TEK · Rainbow SNOW MOUSE||
|27|32.00T|Diamond RIC-1200 · Rainbow IG · Beskar DRFT-R||

#### Cycle 4

|Rebirth|Credits|Required droids (tier)|Unlocks|
|-|-|-|-|
|1|10K|Base ID10 · Base PIT · Base DRK-1 PROBE||
|2|150K|Base R3 · Base 2BB · Base SENATE HOVERCAM||
|3|975K|Gold R5 · Gold R8 · Base R4||
|4|2.95M|Gold B1 BATTLE · Gold R9 · Gold B1 SECURITY||
|5|5.35M|Gold R3 · Gold 2BB · Gold SENATE HOVERCAM||
|6|9.85M|Diamond R5 · Diamond R4 · Diamond BDX EXPLORER||
|7|14.5M|Diamond R8 · Diamond B1 BATTLE · Diamond R9||
|8|36M|Rainbow R3 · Rainbow B1 SECURITY · Rainbow 2BB||
|9|89M|Rainbow R5 · Rainbow R4 · Rainbow BDX EXPLORER||
|10|220M|Rainbow SENATE HOVERCAM · Base GROUNDMECH · Base TRAK-R||
|11|550M|Base B2 HEAVY · Base B2 SUPER · Base UTIL-TEC||
|12|1.36B|Rainbow BAL-CORE · Gold GROUNDMECH · Gold TRAK-R||
|13|3.40B|Rainbow B2 SUPER · Base MECHA-DROID · Base PROTO-ROLLER||
|14|8.45B|Diamond BAL-CORE · Diamond GROUNDMECH · Rainbow TRAK-R||
|15|21.00B|Diamond B2 HEAVY · Rainbow B2 SUPER · Base B2-RP||
|16|52.00B|Rainbow UTIL-TEC · Base BB9 · Gold R7||
|17|130.00B|Base OPTI-STRK · Gold CYCLO-GRAV · Gold MECHA-DROID||
|18|325.00B|Gold B2-RP · Gold BB9 · Diamond R7||
|19|810.00B|Diamond MECHA-DROID · Rainbow R7 · Rainbow B2-RP||
|20|2.00T|Rainbow MONO-WLKR · Rainbow OPTI-STRK · Rainbow CYCLO-GRAV||
|21|3.00T|Beskar AMP WALKER · Beskar GROUNDMECH · Beskar HAUL-R||
|22|4.50T|Beskar GUNRUNNER · Beskar STRIKE-ORB · Beskar B2 SUPER||
|23|6.00T|Beskar MONO-WLKR · Beskar CYCLO-GRAV · Beskar B2-RP||
|24|9.00T|Beskar MECHA-DROID · Beskar PROTO-ROLLER · Base MO-TRAK||
|25|13.50T|Beskar OPTI-STRK · Base TRI-TEK · Gold DRFT-R||
|26|21.00T|Gold CYCLENS · Diamond LEP · Rainbow MO-TRAK||
|27|32.00T|Diamond RIC-1200 · Rainbow SNOW MOUSE · Beskar LOADLIFTER||


### 8.3 Nova Shop upgrade ladders (117 rows)

Blank = that upgrade has no level that high (ladders differ in length).

#### Core upgrades (Nova Crystal cost per level)

|Level|Max Health|Damage|Credits|Flawless Charm|Movement Speed|Double Daily Quests|Pickaxe Mastery|Jawa Bartering|Super Crates|
|-|-|-|-|-|-|-|-|-|-|
|1|1|1|2|500|1|75|5|5|10|
|2|6|13|6||2||10|15|25|
|3|13|25|10||4||15|30||
|4|19|37|14||6||20|45||
|5|25|49|18||8||25|60||
|6|31|61|22||10||30|||
|7|37|73|26||12||35|||
|8|43|85|30||14||40|||
|9|||34||16||45|||
|10|||38||18||50|||
|11|||42||20||55|||
|12|||46||22|||||
|13|||50||24|||||
|14|||54||26|||||
|15|||58||28|||||
|16|||62||30|||||
|17|||66||32|||||
|18|||70||34|||||

#### Workshop upgrades (Nova Crystal cost per level)

|Level|Lounge Slot|Upgrade Chip Scrap|Scrap Value|Blueprint Scrap|Crafting Speed|Blueprint Storage|Collect All|Rebirth Droid Alert|Blueprint Vendor|
|-|-|-|-|-|-|-|-|-|-|
|1|1|2|25|1|3|10|3|10|10|
|2|30|5|55|12|18|75|25|||
|3|60|10|85|24|33|150|100|||
|4||15|115|36|48|||||
|5||20|145||63|||||
|6||25|175||78|||||
|7||30|205||93|||||
|8||35|235||108|||||
|9||40|265||123|||||
|10||45|295||138|||||


<!-- END GENERATED DATA -->
