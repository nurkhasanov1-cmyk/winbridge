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
const MAX_HEARTBEAT_TIMER_DELAY_MS = 2_147_483_647;

export function createRelayHeartbeatConfig(env: NodeJS.ProcessEnv = process.env): RelayHeartbeatSetting {
  if (!parseEnabled(env.WINBRIDGE_RELAY_HEARTBEAT_ENABLED)) {
    return false;
  }

  return normalizeRelayHeartbeatConfig({
    intervalMs: parseHeartbeatTimerEnv(
      env.WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      "WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS"
    ),
    timeoutMs: parseHeartbeatTimerEnv(
      env.WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      "WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS"
    )
  });
}

export function normalizeRelayHeartbeatConfig(config: RelayHeartbeatConfig): RelayHeartbeatConfig {
  assertSafeHeartbeatTimer(config.intervalMs, "Heartbeat interval");
  assertSafeHeartbeatTimer(config.timeoutMs, "Heartbeat timeout");
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

function parseHeartbeatTimerEnv(
  raw: string | undefined,
  fallback: number,
  name: string
): number {
  if (raw === undefined) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);

  if (String(value) !== raw) {
    throw new Error(`${name} must be an exact integer from 1 through ${MAX_HEARTBEAT_TIMER_DELAY_MS}`);
  }

  assertSafeHeartbeatTimer(value, name);
  return value;
}

function assertSafeHeartbeatTimer(value: number, label: string): void {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_HEARTBEAT_TIMER_DELAY_MS
  ) {
    throw new Error(`${label} must be an exact integer from 1 through ${MAX_HEARTBEAT_TIMER_DELAY_MS}`);
  }
}
