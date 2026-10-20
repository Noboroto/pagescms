CREATE TABLE "brevo_mail_setting" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"api_key_ciphertext" text,
	"api_key_iv" text,
	"sender_email" text,
	"sender_name" text,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
