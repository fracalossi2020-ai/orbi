ALTER TABLE "users" ADD COLUMN "cpf" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_cpf_unique" UNIQUE("cpf");