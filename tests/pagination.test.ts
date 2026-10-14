import { describe, expect, it } from "vitest";
import {
  InvalidCursorError,
  clampPageSize,
  decodeTimeCursor,
  encodeTimeCursor,
} from "@/lib/pagination";

describe("time cursor pagination", () => {
  it("round-trips a stable createdAt and id cursor", () => {
    const value = {
      createdAt: new Date("2026-10-14T05:00:00.123Z"),
      id: "post_123",
    };
    expect(decodeTimeCursor(encodeTimeCursor(value))).toEqual(value);
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeTimeCursor("not-a-cursor")).toThrow(InvalidCursorError);
  });

  it("enforces the maximum page size", () => {
    expect(clampPageSize(5)).toBe(5);
    expect(clampPageSize(5_000)).toBe(20);
    expect(clampPageSize(0)).toBe(20);
  });
});
