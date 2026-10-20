import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { brevoMailSettingTable } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

// Brevo transactional email stored in the DB (API key encrypted with CRYPTO_KEY).
// The key never goes back to the browser; the mailer reads it through a short cache.

const ROW_ID = 1;
const CACHE_TTL_MS = 15_000;

type BrevoConfig = { apiKey: string; senderEmail: string; senderName: string | null };

const saveInputSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(8, "API key is too short.")
    .max(512, "API key is too long.")
    .regex(/^\S+$/, "API key must not contain spaces.")
    .optional(),
  clearApiKey: z.boolean().optional(),
  senderEmail: z.string().trim().email("Sender email is not valid.").max(254),
  senderName: z
    .string()
    .trim()
    .max(100, "Sender name is too long.")
    .regex(/^[^\u0000-\u001f\u007f]*$/, "Sender name has invalid characters.")
    .optional(),
});

type SaveBrevoInput = z.input<typeof saveInputSchema>;

const readRow = async () => {
  const rows = await db
    .select()
    .from(brevoMailSettingTable)
    .where(eq(brevoMailSettingTable.id, ROW_ID))
    .limit(1);
  return rows[0] ?? null;
};

let cached: { value: BrevoConfig | null; expiresAt: number } | null = null;
let inflight: Promise<BrevoConfig | null> | null = null;

const loadConfig = async (): Promise<BrevoConfig | null> => {
  const row = await readRow();
  if (!row?.apiKeyCiphertext || !row.apiKeyIv || !row.senderEmail) return null;
  try {
    const apiKey = await decrypt(row.apiKeyCiphertext, row.apiKeyIv);
    return apiKey ? { apiKey, senderEmail: row.senderEmail, senderName: row.senderName } : null;
  } catch {
    console.warn("[brevo-settings] stored API key could not be decrypted; using env email provider");
    return null;
  }
};

// Null when Brevo is not configured in Settings (callers fall back to env providers).
const getBrevoConfig = async (): Promise<BrevoConfig | null> => {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  inflight ??= loadConfig()
    .then((value) => {
      cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    })
    .catch((error) => {
      console.error("[brevo-settings] reload failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Keep serving the last known config; otherwise fall back to env providers.
      return cached?.value ?? null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

const invalidateBrevoCache = () => {
  cached = null;
};

// Safe for the admin UI: no key material.
const getBrevoStatus = async () => {
  const row = await readRow();
  return {
    apiKeySet: Boolean(row?.apiKeyCiphertext),
    senderEmail: row?.senderEmail ?? "",
    senderName: row?.senderName ?? "",
  };
};

const saveBrevoSettings = async (input: SaveBrevoInput, userId: string) => {
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid Brevo settings.");
  const { apiKey, clearApiKey, senderEmail, senderName } = parsed.data;
  if (apiKey && clearApiKey) throw new Error("Provide a new API key or clear it, not both.");

  const keyFields = apiKey
    ? await encrypt(apiKey).then(({ ciphertext, iv }) => ({ apiKeyCiphertext: ciphertext, apiKeyIv: iv }))
    : clearApiKey
      ? { apiKeyCiphertext: null, apiKeyIv: null }
      : {};

  const values = {
    senderEmail,
    senderName: senderName || null,
    updatedBy: userId,
    updatedAt: new Date(),
    ...keyFields,
  };
  await db
    .insert(brevoMailSettingTable)
    .values({ id: ROW_ID, ...values })
    .onConflictDoUpdate({ target: brevoMailSettingTable.id, set: values });
  invalidateBrevoCache();
};

export { getBrevoConfig, getBrevoStatus, invalidateBrevoCache, saveBrevoSettings };
export type { BrevoConfig };
