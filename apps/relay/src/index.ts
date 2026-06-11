import { createRelayRuntime } from "./server.js";

const runtime = createRelayRuntime({
  port: Number.parseInt(process.env.WINBRIDGE_RELAY_PORT ?? "8787", 10),
  sharedToken: process.env.WINBRIDGE_RELAY_SHARED_TOKEN
});

const shutdown = async () => {
  await runtime.stop();
};

process.on("SIGINT", () => {
  shutdown()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
});

process.on("SIGTERM", () => {
  shutdown()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
});

runtime.start().catch((error) => {
  console.error(error);
  process.exit(1);
});
