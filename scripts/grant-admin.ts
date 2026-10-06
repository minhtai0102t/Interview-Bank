import { parseArgs } from "node:util";

import { loadEnvConfig } from "@next/env";

import { getPrisma } from "@/lib/prisma";

const USAGE = "Usage: pnpm admin:grant --email <address>";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

/** The address from the command line, trimmed and lower-cased as Better Auth stores it; null when it is missing or unclear. */
function emailFromArguments(args: string[]): string | null {
  try {
    const { values } = parseArgs({ args, options: { email: { type: "string" } }, strict: true, allowPositionals: false });
    return values.email?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Returns the process exit code: 0 done, 1 nobody has that address, 2 unclear arguments. */
async function main(): Promise<number> {
  const email = emailFromArguments(process.argv.slice(2));
  if (!email) {
    console.error(USAGE);
    return 2;
  }

  const prisma = getPrisma();
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!user) {
      console.error(`No one has signed in with ${email} yet. Sign in once with Google or GitHub, then run this again.`);
      return 1;
    }
    if (user.role === "ADMIN") {
      console.log(`${email} is already an administrator.`);
      return 0;
    }

    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    console.log(`${email} is now an administrator.`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
