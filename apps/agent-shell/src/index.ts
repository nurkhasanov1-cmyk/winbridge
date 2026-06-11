import { FileAuditSink } from "@winbridge/audit-log";
import { parseArgs } from "./args.js";
import { reportAgentShellCliError } from "./cli-diagnostics.js";
import { createAgentShellRuntime } from "./runtime.js";

try {
  const args = parseArgs(process.argv.slice(2));
  const runtime = createAgentShellRuntime({
    ...args,
    auditSink: args.auditLogPath ? new FileAuditSink(args.auditLogPath) : undefined
  });

  const shutdown = async () => {
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

  runtime.start().catch((error) => {
    reportAgentShellCliError(error);
    process.exit(1);
  });
} catch (error) {
  reportAgentShellCliError(error);
  process.exit(1);
}
