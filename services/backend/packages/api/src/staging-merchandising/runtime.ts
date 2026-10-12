/**
 * CHG-029 staging guard.
 *
 * Merchandising presets are bounded-staging only. They are enabled only when the environment
 * explicitly declares `BUILDKART_ENVIRONMENT=staging`, so an unlabelled development or production
 * runtime fails closed.
 */
export function isStagingMerchandisingEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.BUILDKART_ENVIRONMENT?.trim().toLowerCase() === "staging";
}
