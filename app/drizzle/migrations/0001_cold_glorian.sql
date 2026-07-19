ALTER TABLE "users" ADD COLUMN "oidc_sub" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "pw_hash";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_oidc_sub_unique" UNIQUE("oidc_sub");