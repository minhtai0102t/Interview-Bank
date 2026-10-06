import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    // Pin the root so a lockfile in a parent folder is never picked up.
    root: __dirname,
    resolveAlias: {
      // The package's browser build needs `document`, which the import Web Worker does not have.
      "decode-named-character-reference": "./src/features/imports/decode-named-character-reference.ts",
    },
  },
};

export default nextConfig;
