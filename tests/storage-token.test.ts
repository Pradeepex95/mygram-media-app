import { describe, expect, it } from "vitest";
import {
  isSafeObjectKey,
  signLocalTokenWithSecret,
  verifyLocalTokenWithSecret,
} from "@/lib/storage";

const secret = "test-secret-at-least-32-characters-long";

describe("local storage tokens", () => {
  it("accepts keys that contain a file extension", () => {
    const key = "media/user_1/photo.png";
    const expiresAt = Date.now() + 60_000;
    const token = signLocalTokenWithSecret(key, expiresAt, secret);
    expect(verifyLocalTokenWithSecret(token, secret)).toEqual({
      key,
      expiresAt,
    });
  });

  it("rejects object keys that leave the storage root", () => {
    expect(isSafeObjectKey("media/user_1/photo.png")).toBe(true);
    expect(isSafeObjectKey("media/user_1/../../etc/passwd")).toBe(false);
    expect(isSafeObjectKey("/etc/passwd")).toBe(false);
    expect(isSafeObjectKey("media/user_1/photo.php")).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = signLocalTokenWithSecret("media/user_1/clip.mp4", 1_000, secret);
    expect(verifyLocalTokenWithSecret(token, secret, 2_000)).toBeNull();
  });
});