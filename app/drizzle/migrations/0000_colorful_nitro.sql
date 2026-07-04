CREATE TABLE "chip_costs" (
	"rarity" text PRIMARY KEY NOT NULL,
	"to_gold" integer NOT NULL,
	"to_diamond" integer NOT NULL,
	"to_rainbow" integer NOT NULL,
	"to_beskar" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cosmetics" (
	"category" text NOT NULL,
	"name" text NOT NULL,
	"requirement" text NOT NULL,
	CONSTRAINT "cosmetics_category_name_pk" PRIMARY KEY("category","name")
);
--> statement-breakpoint
CREATE TABLE "counts" (
	"profile_id" integer NOT NULL,
	"cycle" integer NOT NULL,
	"droid" text NOT NULL,
	"tier" text NOT NULL,
	"n" integer NOT NULL,
	CONSTRAINT "counts_profile_id_cycle_droid_tier_pk" PRIMARY KEY("profile_id","cycle","droid","tier")
);
--> statement-breakpoint
CREATE TABLE "data_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"checksum" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "droid_tiers" (
	"droid" text NOT NULL,
	"tier" text NOT NULL,
	"buy" bigint,
	"income" bigint,
	"sell" bigint,
	CONSTRAINT "droid_tiers_droid_tier_pk" PRIMARY KEY("droid","tier")
);
--> statement-breakpoint
CREATE TABLE "droids" (
	"name" text PRIMARY KEY NOT NULL,
	"rarity" text NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova_shop" (
	"category" text NOT NULL,
	"item" text NOT NULL,
	"level" integer NOT NULL,
	"cost" integer NOT NULL,
	CONSTRAINT "nova_shop_category_item_level_pk" PRIMARY KEY("category","item","level")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"profile_id" integer NOT NULL,
	"cycle" integer NOT NULL,
	"rebirth" integer NOT NULL,
	CONSTRAINT "plans_profile_id_cycle_rebirth_pk" PRIMARY KEY("profile_id","cycle","rebirth")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"cycle" integer DEFAULT 1 NOT NULL,
	"current_rebirth" integer DEFAULT 0 NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebirth_meta" (
	"rebirth" integer PRIMARY KEY NOT NULL,
	"nova" integer NOT NULL,
	"credit_mult" integer NOT NULL,
	"xp_mult" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebirth_reqs" (
	"cycle" integer NOT NULL,
	"rebirth" integer NOT NULL,
	"droid" text NOT NULL,
	"tier" text NOT NULL,
	"credits" text NOT NULL,
	"unlock" text,
	CONSTRAINT "rebirth_reqs_cycle_rebirth_droid_tier_pk" PRIMARY KEY("cycle","rebirth","droid","tier")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"pw_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "counts" ADD CONSTRAINT "counts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;