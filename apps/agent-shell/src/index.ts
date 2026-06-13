import { FileAuditSink } from "@winbridge/audit-log";
import { parseArgs } from "./args.js";
import { reportAgentShellCliError } from "./cli-diagnostics.js";
import { createInteractiveHostDecisionProvider } from "./host-consent-prompt.js";
import { startInteractiveHostControlPrompt, type HostControlPromptHandle } from "./host-control-prompt.js";
import { createAgentShellRuntime } from "./runtime.js";
import { scheduleViewerLocalDisconnect, type ViewerLocalDisconnectHandle } from "./viewer-disconnect.js";
import { scheduleViewerStatusPrint, type ViewerStatusPrintHandle } from "./viewer-status.js";

try {
  const args = parseArgs(process.argv.slice(2));
  let hostControlPrompt: HostControlPromptHandle | undefined;
  let viewerLocalDisconnect: ViewerLocalDisconnectHandle | undefined;
  let viewerStatusPrint: ViewerStatusPrintHandle | undefined;
  const runtime = createAgentShellRuntime({
    ...args,
    hostDecisionProvider: args.hostConsentPrompt
      ? createInteractiveHostDecisionProvider({ timeoutMs: args.hostConsentTimeoutMs })
      : undefined,
    auditSink: args.auditLogPath ? new FileAuditSink(args.auditLogPath) : undefined
  });

  const shutdown = async () => {
    hostControlPrompt?.stop();
    viewerLocalDisconnect?.stop();
    viewerStatusPrint?.stop();
    await runtime.stop();
  };

  process.on("SIGINT", () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((error) => {
        reportAgentShellCliError(error);
        process.exit(1);
      });
  });

  process.on("SIGTERM", () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((error) => {
        reportAgentShellCliError(error);
        process.exit(1);
      });
  });

  runtime
    .start()
    .then(() => {
      if (args.hostControlPrompt) {
        hostControlPrompt = startInteractiveHostControlPrompt(runtime);
      }

      if (args.viewerStatusAfterMs !== undefined) {
        viewerStatusPrint = scheduleViewerStatusPrint(runtime, args.viewerStatusAfterMs);
      }

      if (args.viewerDisconnectAfterMs !== undefined) {
        viewerLocalDisconnect = scheduleViewerLocalDisconnect(
          runtime,
          args.viewerDisconnectAfterMs
        );
      }
    })
    .catch((error) => {
      reportAgentShellCliError(error);
      process.exit(1);
    });
} catch (error) {
  reportAgentShellCliError(error);
  process.exit(1);
}
