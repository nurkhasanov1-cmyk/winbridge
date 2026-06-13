import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { PermissionSchema, type Permission } from "@winbridge/protocol";
import { formatAgentShellCliError } from "./cli-diagnostics.js";
import type { AgentShellRuntime } from "./runtime.js";

export type HostControlPromptStreams = {
  input?: Readable;
  output?: Writable;
};

export type HostControlPromptOptions = HostControlPromptStreams;

export type HostControlPromptHandle = {
  stop(): void;
};

type HostControlCommand =
  | { action: "pause" }
  | { action: "resume" }
  | { action: "terminate" }
  | { action: "disconnect" }
  | { action: "revoke"; permission: Permission };

const HOST_CONTROL_PROMPT_TEXT =
  "[winbridge-agent] Host controls: pause | resume | revoke <permission> | terminate | disconnect\n";
const HOST_CONTROL_ACCEPTED_PREFIX = "[winbridge-agent] host control accepted";
const HOST_CONTROL_REJECTED_MESSAGE = "[winbridge-agent] host control rejected";
const HOST_CONTROL_STOPPED_MESSAGE = "[winbridge-agent] host control prompt stopped\n";

export function startInteractiveHostControlPrompt(
  runtime: AgentShellRuntime,
  options: HostControlPromptOptions = {}
): HostControlPromptHandle {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const readline = createInterface({ input, output, terminal: false });
  let stopped = false;

  output.write(HOST_CONTROL_PROMPT_TEXT);

  readline.on("line", (line) => {
    handleHostControlLine(runtime, output, line);
  });
  readline.once("close", () => {
    if (!stopped) {
      stopped = true;
      output.write(HOST_CONTROL_STOPPED_MESSAGE);
    }
  });

  return {
    stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      readline.close();
    }
  };
}

export function parseHostControlCommand(line: string): HostControlCommand | undefined {
  switch (line) {
    case "pause":
      return { action: "pause" };
    case "resume":
      return { action: "resume" };
    case "terminate":
      return { action: "terminate" };
    case "disconnect":
      return { action: "disconnect" };
    default:
      return parseRevokeCommand(line);
  }
}

function parseRevokeCommand(line: string): HostControlCommand | undefined {
  const match = /^revoke ([^\s]+)$/.exec(line);
  if (!match) {
    return undefined;
  }

  try {
    return { action: "revoke", permission: PermissionSchema.parse(match[1]) };
  } catch {
    return undefined;
  }
}

function handleHostControlLine(
  runtime: AgentShellRuntime,
  output: Writable,
  line: string
): void {
  const command = parseHostControlCommand(line);
  if (!command) {
    output.write(`${HOST_CONTROL_REJECTED_MESSAGE}\n`);
    return;
  }

  try {
    runHostControlCommand(runtime, command);
    output.write(`${HOST_CONTROL_ACCEPTED_PREFIX} action=${command.action}\n`);
  } catch (error) {
    output.write(`${formatAgentShellCliError(error)}\n`);
  }
}

function runHostControlCommand(runtime: AgentShellRuntime, command: HostControlCommand): void {
  switch (command.action) {
    case "pause":
      runtime.pause();
      return;
    case "resume":
      runtime.resume();
      return;
    case "terminate":
      runtime.terminate();
      return;
    case "disconnect":
      runtime.disconnect();
      return;
    case "revoke":
      runtime.revokePermission(command.permission);
      return;
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}
