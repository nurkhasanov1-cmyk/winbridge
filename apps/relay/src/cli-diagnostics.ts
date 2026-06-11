const RELAY_CLI_ERROR_PREFIX = "[winbridge-relay] error";
const RELAY_CLI_FALLBACK_ERROR_MESSAGE = "Unexpected relay CLI error";

export function formatRelayCliError(error: unknown): string {
  return `${RELAY_CLI_ERROR_PREFIX} messageBytes=${cliErrorMessageBytes(error)}`;
}

export function reportRelayCliError(error: unknown): void {
  console.error(formatRelayCliError(error));
}

function cliErrorMessageBytes(error: unknown): number {
  if (error instanceof Error) {
    return Buffer.byteLength(error.message);
  }

  if (typeof error === "string") {
    return Buffer.byteLength(error);
  }

  return Buffer.byteLength(RELAY_CLI_FALLBACK_ERROR_MESSAGE);
}
