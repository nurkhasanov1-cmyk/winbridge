import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { formatAgentShellCliError } from "./cli-diagnostics.js";
import type { AgentShellRuntime } from "./runtime.js";
import { formatViewerStatus } from "./viewer-status.js";

export type ViewerControlPromptStreams = {
  input?: Readable;
  output?: Writable;
};

export type ViewerControlPromptOptions = ViewerControlPromptStreams;

export type ViewerControlPromptHandle = {
  stop(): void;
};

export type ViewerControlRuntime = Pick<AgentShellRuntime, "getViewerStatus" | "leave">;

type ViewerControlCommand =
  | { action: "help" }
  | { action: "status" }
  | { action: "disconnect" };

const VIEWER_CONTROL_PROMPT_TEXT =
  "[winbridge-agent] Viewer controls: help | status | disconnect\n";
const VIEWER_CONTROL_ACCEPTED_PREFIX = "[winbridge-agent] viewer control accepted";
const VIEWER_CONTROL_REJECTED_MESSAGE = "[winbridge-agent] viewer control rejected";
const VIEWER_CONTROL_STOPPED_MESSAGE = "[winbridge-agent] viewer control prompt stopped\n";
const VIEWER_CONTROL_HELP_TEXT =
  "[winbridge-agent] viewer control help commands=help,status,disconnect\n";

export function startInteractiveViewerControlPrompt(
  runtime: ViewerControlRuntime,
  options: ViewerControlPromptOptions = {}
): ViewerControlPromptHandle {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const readline = createInterface({ input, output, terminal: false });
  let stopped = false;

  const stopPrompt = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    readline.close();
  };

  output.write(VIEWER_CONTROL_PROMPT_TEXT);

  readline.on("line", (line) => {
    if (stopped) {
      return;
    }

    handleViewerControlLine(runtime, output, stopPrompt, line);
  });
  readline.once("close", () => {
    if (!stopped) {
      stopped = true;
      output.write(VIEWER_CONTROL_STOPPED_MESSAGE);
    }
  });

  return {
    stop() {
      stopPrompt();
    }
  };
}

export function parseViewerControlCommand(line: string): ViewerControlCommand | undefined {
  switch (line) {
    case "help":
      return { action: "help" };
    case "status":
      return { action: "status" };
    case "disconnect":
      return { action: "disconnect" };
    default:
      return undefined;
  }
}

export function formatViewerControlHelp(): string {
  return VIEWER_CONTROL_HELP_TEXT;
}

function handleViewerControlLine(
  runtime: ViewerControlRuntime,
  output: Writable,
  stopPrompt: () => void,
  line: string
): void {
  const command = parseViewerControlCommand(line);
  if (!command) {
    output.write(`${VIEWER_CONTROL_REJECTED_MESSAGE}\n`);
    return;
  }

  if (command.action === "help") {
    output.write(formatViewerControlHelp());
    return;
  }

  if (command.action === "status") {
    try {
      output.write(formatViewerStatus(runtime.getViewerStatus()));
    } catch (error) {
      output.write(`${formatAgentShellCliError(error)}\n`);
    }
    return;
  }

  Promise.resolve()
    .then(() => runtime.leave())
    .then(() => {
      output.write(`${VIEWER_CONTROL_ACCEPTED_PREFIX} action=disconnect\n`);
      stopPrompt();
    })
    .catch((error: unknown) => {
      output.write(`${formatAgentShellCliError(error)}\n`);
    });
}
