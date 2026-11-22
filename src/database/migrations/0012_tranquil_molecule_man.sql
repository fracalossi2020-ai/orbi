CREATE TABLE "emergencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"triggered_by" uuid NOT NULL,
	"actor" text NOT NULL,
	"ticket_id" uuid,
	"driver_lat" double precision,
	"driver_lng" double precision,
	"passenger_lat" double precision,
	"passenger_lng" double precision,
	"actor_lat" double precision,
	"actor_lng" double precision,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergencies" ADD CONSTRAINT "emergencies_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergencies" ADD CONSTRAINT "emergencies_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergencies" ADD CONSTRAINT "emergencies_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergencies" ADD CONSTRAINT "emergencies_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emergencies_ride" ON "emergencies" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "emergencies_open" ON "emergencies" USING btree ("reviewed_at");