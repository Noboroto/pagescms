import "server-only";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { googleAuthSettingTable } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

// Google OAuth client stored in the DB (secret encrypted with CRYPTO_KEY, like
// GitHub tokens). The secret is never returned to the browser.

const ROW_ID = 1;

type GoogleAuthRow = typeof googleAuthSettingTable.$inferSelect;
type GoogleAuthConfig = { clientId: string; clientSecret: string };

const clientIdSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/,
    "Client ID must look like 123-abc.apps.googleusercontent.com.",
  );

const clientSecretSchema = z
  .string()
  .trim()
  .min(8, "Client secret is too short.")
  .max(256, "Client secret is too long.")
  .regex(/^\S+$/, "Client secret must not contain spaces.");

const saveInputSchema = z.object({
  clientId: clientIdSchema,
  clientSecret: clientSecretSchema.optional(),
  clearSecret: z.boolean().optional(),
  enabled: z.boolean(),
});

type SaveGoogleAuthInput = z.input<typeof saveInputSchema>;

const readGoogleAuthRow = async (): Promise<GoogleAuthRow | null> => {
  const rows = await db
    .select()
    .from(googleAuthSettingTable)
    .where(eq(googleAuthSettingTable.id, ROW_ID))
    .limit(1);
  return rows[0] ?? null;
};

// Usable config, or null when disabled / incomplete / undecryptable.
const resolveGoogleConfig = async (row: GoogleAuthRow | null): Promise<GoogleAuthConfig | null> => {
  if (!row || !row.enabled || !row.clientId || !row.secretCiphertext || !row.secretIv) return null;
  try {
    const clientSecret = await decrypt(row.secretCiphertext, row.secretIv);
    return clientSecret ? { clientId: row.clientId, clientSecret } : null;
  } catch {
    console.warn("[google-settings] stored client secret could not be decrypted; Google sign-in disabled");
    return null;
  }
};

// Safe to send to the admin UI: no secret material.
const getGoogleAuthStatus = async () => {
  const row = await readGoogleAuthRow();
  return {
    clientId: row?.clientId ?? "",
    secretSet: Boolean(row?.secretCiphertext),
    enabled: Boolean(row?.enabled),
  };
};

const saveGoogleAuthSettings = async (input: SaveGoogleAuthInput, userId: string) => {
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid Google settings.");
  }
  const { clientId, clientSecret, clearSecret, enabled } = parsed.data;
  if (clientSecret && clearSecret) throw new Error("Provide a new secret or clear it, not both.");

  const existing = await readGoogleAuthRow();
  const willHaveSecret = clientSecret ? true : clearSecret ? false : Boolean(existing?.secretCiphertext);
  if (enabled && !willHaveSecret) throw new Error("Set a client secret before enabling Google sign-in.");

  const secretFields = clientSecret
    ? await encrypt(clientSecret).then(({ ciphertext, iv }) => ({
        secretCiphertext: ciphertext,
        secretIv: iv,
      }))
    : clearSecret
      ? { secretCiphertext: null, secretIv: null }
      : {};

  const values = { clientId, enabled, updatedBy: userId, updatedAt: new Date(), ...secretFields };
  await db
    .insert(googleAuthSettingTable)
    .values({ id: ROW_ID, ...values })
    .onConflictDoUpdate({
      target: googleAuthSettingTable.id,
      set: { ...values, version: sql`${googleAuthSettingTable.version} + 1` },
    });
};

export {
  getGoogleAuthStatus,
  readGoogleAuthRow,
  resolveGoogleConfig,
  saveGoogleAuthSettings,
};
export type { GoogleAuthConfig, GoogleAuthRow };
