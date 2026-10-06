import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/prisma";

import { createUser, disconnectDatabase, resetDatabase } from "../helpers/database";

const run = promisify(execFile);
const tsx = createRequire(`${process.cwd()}/package.json`).resolve("tsx/cli");

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs the real command line tool against the test database, as `pnpm admin:grant` does. */
async function grantAdmin(...args: string[]): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await run(process.execPath, [tsx, "--conditions", "react-server", "scripts/grant-admin.ts", ...args], {
      cwd: process.cwd(),
      env: process.env,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

async function roleOf(userId: string): Promise<string> {
  return (await getPrisma().user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } })).role;
}

describe("the admin:grant command", () => {
  it("makes the person with that email address an administrator, and only that person", async () => {
    const ada = await createUser({ email: "ada@example.test" });
    const bystander = await createUser();

    const result = await grantAdmin("--email", "ada@example.test");

    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(result.stdout).toContain("ada@example.test is now an administrator");
    expect(await roleOf(ada.id)).toBe("ADMIN");
    expect(await roleOf(bystander.id)).toBe("USER");
  });

  it("can be run again without harm", async () => {
    const ada = await createUser({ email: "ada@example.test" });
    await grantAdmin("--email", "ada@example.test");

    const again = await grantAdmin("--email", "ada@example.test");

    expect(again).toMatchObject({ code: 0, stderr: "" });
    expect(again.stdout).toContain("already an administrator");
    expect(await roleOf(ada.id)).toBe("ADMIN");
  });

  it("finds the person however the address is capitalised or spaced", async () => {
    const ada = await createUser({ email: "ada@example.test" });

    const result = await grantAdmin("--email", "  Ada@Example.TEST ");

    expect(result.code).toBe(0);
    expect(await roleOf(ada.id)).toBe("ADMIN");
  });

  it("fails with a hint, and changes nobody, when no one has signed in with that address", async () => {
    const bystander = await createUser();

    const result = await grantAdmin("--email", "nobody@example.test");

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("No one has signed in with nobody@example.test");
    expect(result.stderr).toContain("Sign in once");
    expect(await roleOf(bystander.id)).toBe("USER");
  });

  it.each([
    { what: "no address", args: [] },
    { what: "an option without a value", args: ["--email"] },
    { what: "a blank address", args: ["--email", "   "] },
    { what: "an address without its option", args: ["ada@example.test"] },
    { what: "an option it does not know", args: ["--email", "ada@example.test", "--everyone"] },
  ])("explains how to use it, and changes nobody, when given $what", async ({ args }) => {
    const ada = await createUser({ email: "ada@example.test" });

    const result = await grantAdmin(...args);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage: pnpm admin:grant --email <address>");
    expect(await roleOf(ada.id)).toBe("USER");
  });
});
