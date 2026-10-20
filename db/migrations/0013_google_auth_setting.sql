CREATE TABLE "google_auth_setting" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"client_id" text,
	"secret_ciphertext" text,
	"secret_iv" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
