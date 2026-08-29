import type { NotificationChannel } from "@/generated/prisma/client";

export type OutboundMessage = {
  channel: NotificationChannel;
  recipient: string;
  body: string;
  subject?: string;
};

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

/** Termii (SMS + WhatsApp) and an email provider implement this in sub-project 8. */
export interface MessageProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<SendResult>;
}

/** Cloudflare R2 implements this in sub-project 6. Objects are private by default (PRD-12 §2). */
export interface StorageProvider {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<{ url: string }>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export type CheckoutInput = {
  invoiceId: string;
  amountKobo: number;
  email: string;
  callbackUrl: string;
};

/** Paystack implements this in sub-project 7. */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; reference: string }>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}
