CREATE TABLE "debt_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debt_settlements" ADD CONSTRAINT "debt_settlements_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_settlements" ADD CONSTRAINT "debt_settlements_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_settlements_driver" ON "debt_settlements" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_settlements_one_pending" ON "debt_settlements" USING btree ("driver_id") WHERE "debt_settlements"."status" = 'pending';