import { AgentShellUsageError } from "./args.js";

const AGENT_SHELL_CLI_ERROR_PREFIX = "[winbridge-agent] error";
const AGENT_SHELL_CLI_FALLBACK_ERROR_MESSAGE = "Unexpected agent shell CLI error";

export function formatAgentShellCliError(error: unknown): string {
  if (error instanceof AgentShellUsageError) {
    return error.message;
  }

  return `${AGENT_SHELL_CLI_ERROR_PREFIX} messageBytes=${cliErrorMessageBytes(error)}`;
}

export function reportAgentShellCliError(error: unknown): void {
  console.error(formatAgentShellCliError(error));
}

function cliErrorMessageBytes(error: unknown): number {
  if (error instanceof Error) {
    return Buffer.byteLength(error.message);
  }

  if (typeof error === "string") {
    return Buffer.byteLength(error);
  }

  return Buffer.byteLength(AGENT_SHELL_CLI_FALLBACK_ERROR_MESSAGE);
}
