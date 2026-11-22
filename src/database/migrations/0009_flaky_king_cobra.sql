ALTER TABLE "plans" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_tier_unique" UNIQUE("tier");