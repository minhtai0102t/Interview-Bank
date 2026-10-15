import Link from "next/link";
import { type ReactNode, Suspense } from "react";

import { AccountMenu } from "@/features/auth/account-menu";

import { MainNav } from "./main-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="min-h-11 py-2 text-base font-semibold">
            Interview Bank
          </Link>
          <div className="ml-auto sm:order-3">
            {/* Looking up the session must not hold back the rest of the page. */}
            <Suspense fallback={<span aria-hidden className="block h-11 w-24" />}>
              <AccountMenu />
            </Suspense>
          </div>
          <div className="basis-full sm:order-2 sm:basis-auto sm:flex-1">
            <MainNav />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8">
        {children}
      </main>
    </>
  );
}
