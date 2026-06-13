import type { Writable } from "node:stream";
import { formatAgentShellCliError } from "./cli-diagnostics.js";
import type { AgentShellRuntime, AgentShellViewerStatusSnapshot } from "./runtime.js";

export type ViewerStatusPrintOptions = {
  output?: Writable;
};

export type ViewerStatusPrintHandle = {
  stop(): void;
};

const VIEWER_STATUS_PREFIX = "[winbridge-agent] viewer status";

export function formatViewerStatus(status: AgentShellViewerStatusSnapshot): string {
  const parts = [
    VIEWER_STATUS_PREFIX,
    `state=${status.state}`,
    `visibleToHost=${status.visibleToHost}`,
    `permissionCount=${status.permissionCount}`
  ];

  if (status.authorizationStatus) {
    parts.push(`authorizationStatus=${status.authorizationStatus}`);
  }

  if (status.authorizationId) {
    parts.push(`authorizationId=${status.authorizationId}`);
  }

  if (status.remoteDisconnectReasonCode) {
    parts.push(`remoteDisconnectReasonCode=${status.remoteDisconnectReasonCode}`);
  }

  return `${parts.join(" ")}\n`;
}

export function scheduleViewerStatusPrint(
  runtime: Pick<AgentShellRuntime, "getViewerStatus">,
  delayMs: number,
  options: ViewerStatusPrintOptions = {}
): ViewerStatusPrintHandle {
  const output = options.output ?? process.stdout;
  let stopped = false;
  const timer = setTimeout(() => {
    if (stopped) {
      return;
    }

    try {
      output.write(formatViewerStatus(runtime.getViewerStatus()));
    } catch (error) {
      output.write(`${formatAgentShellCliError(error)}\n`);
    }
  }, delayMs);

  return {
    stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      clearTimeout(timer);
    }
  };
}
