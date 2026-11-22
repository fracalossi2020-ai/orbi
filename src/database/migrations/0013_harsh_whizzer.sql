CREATE TABLE "deleted_cpf_blocks" (
	"cpf_hmac" text PRIMARY KEY NOT NULL,
	"blocked_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "rating_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "emergencies" ADD COLUMN "trigger_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "emergencies" ADD COLUMN "last_triggered_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "review_reason" text;--> statement-breakpoint
CREATE INDEX "audit_log_actor_action" ON "audit_log" USING btree ("actor_id","action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "emergencies_ride_open" ON "emergencies" USING btree ("ride_id") WHERE "emergencies"."reviewed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_ride_settle" ON "ledger" USING btree ("ride_id","type") WHERE "ledger"."type" in ('ride_net', 'cash_due');--> statement-breakpoint
CREATE UNIQUE INDEX "offers_ride_pending" ON "offers" USING btree ("ride_id") WHERE "offers"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "offers_driver_pending" ON "offers" USING btree ("driver_id") WHERE "offers"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "payments_ride" ON "payments" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "payments_status_provider" ON "payments" USING btree ("status","provider");--> statement-breakpoint
CREATE INDEX "ride_messages_ride" ON "ride_messages" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "rides_status_scheduled" ON "rides" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "tickets_user" ON "tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "withdrawals_driver" ON "withdrawals" USING btree ("driver_id");