export type RelayHeartbeatConfig = {
  intervalMs: number;
  timeoutMs: number;
};

export type RelayHeartbeatSetting = RelayHeartbeatConfig | false;

export type RelayHeartbeatState = {
  awaitingPong: boolean;
  lastPingAt?: number;
  lastPongAt?: number;
};

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export function createRelayHeartbeatConfig(env: NodeJS.ProcessEnv = process.env): RelayHeartbeatSetting {
  if (!parseEnabled(env.WINBRIDGE_RELAY_HEARTBEAT_ENABLED)) {
    return false;
  }

  return normalizeRelayHeartbeatConfig({
    intervalMs: Number.parseInt(
      env.WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
      10
    ),
    timeoutMs: Number.parseInt(
      env.WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS),
      10
    )
  });
}

export function normalizeRelayHeartbeatConfig(config: RelayHeartbeatConfig): RelayHeartbeatConfig {
  assertPositiveInteger(config.intervalMs, "Heartbeat interval");
  assertPositiveInteger(config.timeoutMs, "Heartbeat timeout");
  return config;
}

export function createRelayHeartbeatState(now = Date.now()): RelayHeartbeatState {
  return {
    awaitingPong: false,
    lastPongAt: now
  };
}

export function markHeartbeatPing(
  state: RelayHeartbeatState,
  now = Date.now()
): RelayHeartbeatState {
  return {
    ...state,
    awaitingPong: true,
    lastPingAt: now
  };
}

export function markHeartbeatPong(
  state: RelayHeartbeatState,
  now = Date.now()
): RelayHeartbeatState {
  return {
    ...state,
    awaitingPong: false,
    lastPongAt: now
  };
}

export function isHeartbeatTimedOut(
  state: RelayHeartbeatState,
  now: number,
  timeoutMs: number
): boolean {
  return state.awaitingPong && state.lastPingAt !== undefined && now - state.lastPingAt >= timeoutMs;
}

function parseEnabled(value: string | undefined): boolean {
  if (value === undefined) {
    return true;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }

  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }

  throw new Error("Heartbeat enabled flag must be one of true, false, yes, no, 1, or 0");
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}
