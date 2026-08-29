import { hash, verify } from "@node-rs/argon2";
import { ARGON2_OPTIONS } from "@/lib/constants";

/** Never log the plaintext or the resulting hash (PRD-12 §2). */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Returns false for a malformed stored hash rather than throwing, so a corrupt
 * row cannot turn a failed login into a 500.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}
