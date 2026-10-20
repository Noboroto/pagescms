// Errors safe to show to the user. Anything else is replaced by a generic
// message in server actions and only its name is logged (driver errors can
// embed query parameters, i.e. encrypted secrets).
class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

const toActionError = (scope: string, error: unknown, fallback: string): { success: false; error: string } => {
  if (error instanceof UserFacingError) return { success: false, error: error.message };
  console.error(`[${scope}] action failed`, {
    name: error instanceof Error ? error.name : typeof error,
    code: (error as { code?: unknown } | null)?.code,
  });
  return { success: false, error: fallback };
};

export { UserFacingError, toActionError };
