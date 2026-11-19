export const TASK_INITIAL_SETUP_DURATION_MS = 2 * 24 * 60 * 60 * 1000;

export function isTaskInInitialSetup(
  expiresAt: string | Date | null | undefined,
  now: number = Date.now()
): boolean {
  const expiration = expiresAt instanceof Date
    ? expiresAt.getTime()
    : expiresAt
      ? Date.parse(expiresAt)
      : Number.NaN;
  return Number.isFinite(expiration) && now < expiration;
}
