import { describe, expect, it } from "vitest";

function nextLockState(params: {
  failedLoginCount: number;
  maxAttempts: number;
  lockoutMinutes: number;
  now: number;
}) {
  const failedLoginCount = params.failedLoginCount + 1;
  const lockedUntil =
    failedLoginCount >= params.maxAttempts
      ? new Date(params.now + params.lockoutMinutes * 60 * 1000)
      : null;
  return { failedLoginCount, lockedUntil };
}

describe("login lockout", () => {
  it("locks after max failed attempts", () => {
    const now = Date.UTC(2026, 0, 1);
    const state = nextLockState({
      failedLoginCount: 4,
      maxAttempts: 5,
      lockoutMinutes: 15,
      now,
    });
    expect(state.failedLoginCount).toBe(5);
    expect(state.lockedUntil?.getTime()).toBe(now + 15 * 60 * 1000);
  });

  it("does not lock before threshold", () => {
    const state = nextLockState({
      failedLoginCount: 2,
      maxAttempts: 5,
      lockoutMinutes: 15,
      now: Date.now(),
    });
    expect(state.failedLoginCount).toBe(3);
    expect(state.lockedUntil).toBeNull();
  });
});
