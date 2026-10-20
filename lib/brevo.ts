const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;
const BREVO_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const ERROR_BODY_MAX_CHARS = 4096;

// Carries only the HTTP status and Brevo's short error code: provider messages
// and fetch errors can echo the request (recipient, API key).
class BrevoRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(status: number | null, code: string | null = null) {
    super(
      status === null
        ? "Brevo request failed (network or timeout)."
        : `Brevo responded ${status}${code ? ` (${code})` : ""}.`,
    );
    this.name = "BrevoRequestError";
    this.status = status;
    this.code = code;
  }
}

const readErrorCode = async (res: Response) => {
  try {
    const text = (await res.text()).slice(0, ERROR_BODY_MAX_CHARS);
    const code = (JSON.parse(text) as { code?: unknown } | null)?.code;
    return typeof code === "string" && BREVO_CODE.test(code) ? code : null;
  } catch {
    return null;
  }
};

// https://developers.brevo.com/reference/send-transac-email
const sendViaBrevo = async (input: {
  apiKey: string;
  sender: { email: string; name?: string | null };
  to: string[];
  subject: string;
  html: string;
  text?: string;
}) => {
  let res: Response;
  try {
    res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": input.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: input.sender.name
          ? { email: input.sender.email, name: input.sender.name }
          : { email: input.sender.email },
        to: input.to.map((email) => ({ email })),
        subject: input.subject,
        htmlContent: input.html,
        ...(input.text ? { textContent: input.text } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new BrevoRequestError(null);
  }
  if (res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return;
  }
  throw new BrevoRequestError(res.status, await readErrorCode(res));
};

export { BrevoRequestError, sendViaBrevo };
