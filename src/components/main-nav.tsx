"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Only routes that exist are listed; later phases add Library search, My Questions, Practice and Progress. */
const links = [
  { href: "/", label: "Library" },
  { href: "/imports", label: "Import" },
] as const;

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main">
      <ul className="flex items-center gap-1">
        {links.map(({ href, label }) => {
          const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium ${
                  current ? "bg-canvas text-primary" : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
