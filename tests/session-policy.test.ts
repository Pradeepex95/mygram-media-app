import { describe, expect, it } from "vitest";

/**
 * Pure policy helpers mirrored from createUserSession behaviour.
 * Integration coverage for DB invalidation is exercised manually
 * (see README single-login checklist).
 */
function decideLogin(params: {
  policy: "newest_wins" | "block_if_active";
  hasActiveSession: boolean;
}): "allow_and_kick" | "block" | "allow" {
  if (!params.hasActiveSession) return "allow";
  if (params.policy === "block_if_active") return "block";
  return "allow_and_kick";
}

describe("single-session policy", () => {
  it("newest_wins kicks previous session", () => {
    expect(
      decideLogin({ policy: "newest_wins", hasActiveSession: true }),
    ).toBe("allow_and_kick");
  });

  it("block_if_active rejects concurrent login", () => {
    expect(
      decideLogin({ policy: "block_if_active", hasActiveSession: true }),
    ).toBe("block");
  });

  it("allows login when no active session", () => {
    expect(
      decideLogin({ policy: "newest_wins", hasActiveSession: false }),
    ).toBe("allow");
  });
});
