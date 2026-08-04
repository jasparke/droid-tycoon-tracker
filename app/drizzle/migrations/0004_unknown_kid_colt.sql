CREATE TABLE "companion_buffs" (
	"kind" text NOT NULL,
	"rarity" text NOT NULL,
	"tier" text NOT NULL,
	"value" integer,
	CONSTRAINT "companion_buffs_kind_rarity_tier_pk" PRIMARY KEY("kind","rarity","tier")
);
--> statement-breakpoint
CREATE TABLE "crafting_times" (
	"droid" text NOT NULL,
	"tier" text NOT NULL,
	"seconds" integer,
	CONSTRAINT "crafting_times_droid_tier_pk" PRIMARY KEY("droid","tier")
);
--> statement-breakpoint
CREATE TABLE "flawless_owned" (
	"profile_id" integer NOT NULL,
	"droid" text NOT NULL,
	CONSTRAINT "flawless_owned_profile_id_droid_pk" PRIMARY KEY("profile_id","droid")
);
--> statement-breakpoint
CREATE TABLE "iconic_companion_effects" (
	"droid" text PRIMARY KEY NOT NULL,
	"effect" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flawless_owned" ADD CONSTRAINT "flawless_owned_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;