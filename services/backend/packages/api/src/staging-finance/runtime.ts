export function isStagingFinanceEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.BUILDKART_ENVIRONMENT?.trim().toLowerCase() === "staging";
}
