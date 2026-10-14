/**
 * Phase 2 payments scaffolding.
 * Wire Stripe or Razorpay here without changing subscription domain rules.
 */

export type PaymentProviderName = "stripe" | "razorpay" | "none";

export type CheckoutSessionInput = {
  userId: string;
  planMonths: 1 | 3 | 6 | 12;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionResult = {
  provider: PaymentProviderName;
  checkoutUrl: string;
  externalId: string;
};

export interface PaymentProvider {
  name: PaymentProviderName;
  createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionResult>;
  verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<{ userId: string; planMonths: number; externalId: string }>;
}

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super("Payments are not configured yet (Phase 2).");
  }
}

export class StripePaymentProvider implements PaymentProvider {
  name: PaymentProviderName = "stripe";

  async createCheckoutSession(): Promise<CheckoutSessionResult> {
    throw new PaymentsNotConfiguredError();
  }

  async verifyWebhook(): Promise<{
    userId: string;
    planMonths: number;
    externalId: string;
  }> {
    throw new PaymentsNotConfiguredError();
  }
}

export class RazorpayPaymentProvider implements PaymentProvider {
  name: PaymentProviderName = "razorpay";

  async createCheckoutSession(): Promise<CheckoutSessionResult> {
    throw new PaymentsNotConfiguredError();
  }

  async verifyWebhook(): Promise<{
    userId: string;
    planMonths: number;
    externalId: string;
  }> {
    throw new PaymentsNotConfiguredError();
  }
}

export function getPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER || "none";
  if (provider === "stripe") return new StripePaymentProvider();
  if (provider === "razorpay") return new RazorpayPaymentProvider();
  return {
    name: "none",
    async createCheckoutSession() {
      throw new PaymentsNotConfiguredError();
    },
    async verifyWebhook() {
      throw new PaymentsNotConfiguredError();
    },
  };
}
