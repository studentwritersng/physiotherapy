import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: import.meta.dirname },
  // Required for forbidden() (requirePageRole): without it the call throws a
  // plain error and guarded pages answer 500 instead of 403. Verified against
  // Next 16.3.3's runtime gate on __NEXT_EXPERIMENTAL_AUTH_INTERRUPTS.
  experimental: { authInterrupts: true },
};

export default config;
