import {
  createRelayPairingConfig,
  createRelayPortConfig,
  createRelayRuntime,
  createRelaySharedTokenConfig
} from "./server.js";
import { reportRelayCliError } from "./cli-diagnostics.js";

try {
  const runtime = createRelayRuntime({
    port: createRelayPortConfig(process.env),
    sharedToken: createRelaySharedTokenConfig(process.env),
    pairing: createRelayPairingConfig(process.env)
  });

  const shutdown = async () => {
    await runtime.stop();
  };

  process.on("SIGINT", () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((error) => {
        reportRelayCliError(error);
        process.exit(1);
      });
  });

  process.on("SIGTERM", () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((error) => {
        reportRelayCliError(error);
        process.exit(1);
      });
  });

  runtime.start().catch((error) => {
    reportRelayCliError(error);
    process.exit(1);
  });
} catch (error) {
  reportRelayCliError(error);
  process.exit(1);
}
