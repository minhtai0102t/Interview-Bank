"use client";

import { BookOpen, ChartColumnIncreasing, FileQuestion, FileUp, FolderKanban, PlayCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Library", icon: BookOpen },
  { href: "/my-questions", label: "My Questions", icon: FileQuestion },
  { href: "/collections", label: "Collections", icon: FolderKanban },
  { href: "/imports", label: "Import", icon: FileUp },
  { href: "/practice", label: "Practice", icon: PlayCircle },
  { href: "/progress", label: "Progress", icon: ChartColumnIncreasing },
] as const;

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="w-full">
      <ul className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control px-3 text-sm font-medium sm:justify-start ${
                  current ? "bg-canvas text-primary" : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
