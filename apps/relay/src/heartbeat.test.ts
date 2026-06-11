import { describe, expect, it } from "vitest";
import {
  createRelayHeartbeatConfig,
  createRelayHeartbeatState,
  isHeartbeatTimedOut,
  markHeartbeatPing,
  markHeartbeatPong,
  normalizeRelayHeartbeatConfig
} from "./heartbeat.js";

const MAX_HEARTBEAT_TIMER_DELAY_MS = 2_147_483_647;

describe("relay heartbeat", () => {
  it("uses enabled development defaults when environment is omitted", () => {
    expect(createRelayHeartbeatConfig({})).toEqual({
      intervalMs: 30_000,
      timeoutMs: 10_000
    });
  });

  it("uses exact heartbeat environment values", () => {
    expect(
      createRelayHeartbeatConfig({
        WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS: "30000",
        WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS: "10000"
      })
    ).toEqual({
      intervalMs: 30_000,
      timeoutMs: 10_000
    });

    expect(
      createRelayHeartbeatConfig({
        WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS: String(MAX_HEARTBEAT_TIMER_DELAY_MS),
        WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS: String(MAX_HEARTBEAT_TIMER_DELAY_MS)
      })
    ).toEqual({
      intervalMs: MAX_HEARTBEAT_TIMER_DELAY_MS,
      timeoutMs: MAX_HEARTBEAT_TIMER_DELAY_MS
    });
  });

  it("can be disabled through development environment", () => {
    expect(
      createRelayHeartbeatConfig({
        WINBRIDGE_RELAY_HEARTBEAT_ENABLED: "false"
      })
    ).toBe(false);
  });

  it("rejects malformed heartbeat environment values", () => {
    const malformedValues = ["", " ", "1000ms", "1.5", "-1", "0", "001"];

    for (const value of malformedValues) {
      expect(() =>
        createRelayHeartbeatConfig({
          WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS: value
        })
      ).toThrow("WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS");

      expect(() =>
        createRelayHeartbeatConfig({
          WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS: value
        })
      ).toThrow("WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS");
    }
  });

  it("rejects timer-unsafe heartbeat environment values", () => {
    expect(() =>
      createRelayHeartbeatConfig({
        WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS: String(MAX_HEARTBEAT_TIMER_DELAY_MS + 1)
      })
    ).toThrow("WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS");

    expect(() =>
      createRelayHeartbeatConfig({
        WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS: String(MAX_HEARTBEAT_TIMER_DELAY_MS + 1)
      })
    ).toThrow("WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS");
  });

  it("validates injected heartbeat settings", () => {
    expect(() => normalizeRelayHeartbeatConfig({ intervalMs: 0, timeoutMs: 1 })).toThrow(
      "Heartbeat interval must be an exact integer from 1 through 2147483647"
    );
    expect(() => normalizeRelayHeartbeatConfig({ intervalMs: 1, timeoutMs: 0 })).toThrow(
      "Heartbeat timeout must be an exact integer from 1 through 2147483647"
    );
    expect(() => normalizeRelayHeartbeatConfig({ intervalMs: 1.5, timeoutMs: 1 })).toThrow(
      "Heartbeat interval must be an exact integer from 1 through 2147483647"
    );
    expect(() =>
      normalizeRelayHeartbeatConfig({ intervalMs: 1, timeoutMs: MAX_HEARTBEAT_TIMER_DELAY_MS + 1 })
    ).toThrow(
      "Heartbeat timeout must be an exact integer from 1 through 2147483647"
    );
  });

  it("tracks ping, pong, and timeout state", () => {
    const initial = createRelayHeartbeatState(1_000);
    const pinged = markHeartbeatPing(initial, 2_000);

    expect(isHeartbeatTimedOut(pinged, 2_999, 1_000)).toBe(false);
    expect(isHeartbeatTimedOut(pinged, 3_000, 1_000)).toBe(true);

    const ponged = markHeartbeatPong(pinged, 2_500);
    expect(isHeartbeatTimedOut(ponged, 4_000, 1_000)).toBe(false);
    expect(ponged.lastPongAt).toBe(2_500);
  });
});
