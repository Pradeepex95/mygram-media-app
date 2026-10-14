import { describe, expect, it } from "vitest";
import { Role, SubscriptionStatus } from "@prisma/client";
import {
  isSubscriptionActive,
  subscriptionBlockMessage,
} from "@/lib/auth/session";

describe("subscription rules", () => {
  it("allows admin regardless of subscription fields", () => {
    expect(
      isSubscriptionActive({
        role: Role.ADMIN,
        status: SubscriptionStatus.EXPIRED,
        subscriptionEnd: new Date(0),
      }),
    ).toBe(true);
  });

  it("blocks expired subscribers", () => {
    expect(
      isSubscriptionActive({
        role: Role.SUBSCRIBER,
        status: SubscriptionStatus.EXPIRED,
        subscriptionEnd: new Date(Date.now() - 1000),
      }),
    ).toBe(false);
    expect(
      subscriptionBlockMessage({
        status: SubscriptionStatus.EXPIRED,
        subscriptionEnd: new Date(0),
      }),
    ).toContain("expired");
  });

  it("blocks suspended subscribers", () => {
    expect(
      isSubscriptionActive({
        role: Role.SUBSCRIBER,
        status: SubscriptionStatus.SUSPENDED,
        subscriptionEnd: new Date(Date.now() + 86400000),
      }),
    ).toBe(false);
    expect(
      subscriptionBlockMessage({
        status: SubscriptionStatus.SUSPENDED,
        subscriptionEnd: new Date(),
      }),
    ).toContain("suspended");
  });

  it("blocks active status when end date is in the past", () => {
    expect(
      isSubscriptionActive({
        role: Role.SUBSCRIBER,
        status: SubscriptionStatus.ACTIVE,
        subscriptionEnd: new Date(Date.now() - 1000),
      }),
    ).toBe(false);
  });

  it("allows active subscribers with future end date", () => {
    expect(
      isSubscriptionActive({
        role: Role.SUBSCRIBER,
        status: SubscriptionStatus.ACTIVE,
        subscriptionEnd: new Date(Date.now() + 86400000),
      }),
    ).toBe(true);
  });
});
