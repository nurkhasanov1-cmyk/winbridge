import type { Writable } from "node:stream";
import { formatAgentShellCliError } from "./cli-diagnostics.js";
import type { AgentShellRuntime } from "./runtime.js";

export type ViewerLocalDisconnectOptions = {
  output?: Writable;
};

export type ViewerLocalDisconnectHandle = {
  stop(): void;
};

export function scheduleViewerLocalDisconnect(
  runtime: Pick<AgentShellRuntime, "stop">,
  delayMs: number,
  options: ViewerLocalDisconnectOptions = {}
): ViewerLocalDisconnectHandle {
  const output = options.output ?? process.stderr;
  let stopped = false;
  const timer = setTimeout(() => {
    if (stopped) {
      return;
    }

    stopped = true;
    runtime.stop().catch((error: unknown) => {
      output.write(`${formatAgentShellCliError(error)}\n`);
    });
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
