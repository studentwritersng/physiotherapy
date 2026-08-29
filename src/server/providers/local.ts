import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type {
  CheckoutInput,
  MessageProvider,
  OutboundMessage,
  PaymentProvider,
  SendResult,
  StorageProvider,
} from "./types";

/**
 * Logs instead of sending. Keeps Foundation and the whole test suite free of
 * Termii credentials and per-message cost (spec §3.9).
 */
export const localMessageProvider: MessageProvider = {
  name: "local-log",
  async send(message: OutboundMessage): Promise<SendResult> {
    console.info("[message:local]", {
      channel: message.channel,
      recipient: message.recipient,
      body: message.body.slice(0, 120),
    });
    return { ok: true, providerMessageId: `local-${randomUUID()}` };
  },
};

const UPLOAD_ROOT = path.join(process.cwd(), ".uploads");

/** Writes under .uploads/, which is gitignored. Replaced by R2 in sub-project 6. */
export const localStorageProvider: StorageProvider = {
  name: "local-fs",
  async put(key, body, _contentType) {
    const target = path.join(UPLOAD_ROOT, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return { url: `/api/files/${key}` };
  },
  async signedUrl(key, _ttlSeconds) {
    // No signing locally; the route handler enforces access instead.
    return `/api/files/${key}`;
  },
  async delete(key) {
    await unlink(path.join(UPLOAD_ROOT, key)).catch(() => undefined);
  },
};

/** Throws rather than pretending to work, so a missing gateway is obvious. */
export const localPaymentProvider: PaymentProvider = {
  name: "local-disabled",
  async createCheckout(_input: CheckoutInput) {
    throw new Error(
      "Online payments are not configured. Record the payment manually, or enable the gateway in sub-project 7.",
    );
  },
  verifyWebhook() {
    return false;
  },
};
