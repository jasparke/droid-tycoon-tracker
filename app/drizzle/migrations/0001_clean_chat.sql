CREATE TABLE "droid_sell_values" (
	"rarity" text NOT NULL,
	"tier" text NOT NULL,
	"multiplier" integer NOT NULL,
	CONSTRAINT "droid_sell_values_rarity_tier_pk" PRIMARY KEY("rarity","tier")
);
--> statement-breakpoint
CREATE TABLE "flawless_spawn" (
	"tier" text PRIMARY KEY NOT NULL,
	"one_in" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova_paint_stages" (
	"stage" integer PRIMARY KEY NOT NULL,
	"crystal_cost" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_previews" (
	"checksum" text PRIMARY KEY NOT NULL,
	"base_version_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"flags" jsonb NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chip_costs" ALTER COLUMN "to_gold" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chip_costs" ALTER COLUMN "to_diamond" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chip_costs" ALTER COLUMN "to_rainbow" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chip_costs" ALTER COLUMN "to_beskar" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "data_versions" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "droids" ADD COLUMN "income_pct" numeric;--> statement-breakpoint
ALTER TABLE "droids" ADD COLUMN "buy_nc" integer;