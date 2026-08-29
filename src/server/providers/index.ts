import "server-only";
import { localMessageProvider, localPaymentProvider, localStorageProvider } from "./local";
import type { MessageProvider, PaymentProvider, StorageProvider } from "./types";

/**
 * Foundation wires the local implementations. Sub-projects 6, 7 and 8 swap these
 * for Cloudflare R2, Paystack and Termii by changing only this file.
 */
export const messageProvider: MessageProvider = localMessageProvider;
export const storageProvider: StorageProvider = localStorageProvider;
export const paymentProvider: PaymentProvider = localPaymentProvider;

export type { MessageProvider, PaymentProvider, StorageProvider } from "./types";
