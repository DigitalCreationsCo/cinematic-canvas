"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "#/lib/utils"
import { ModeToggle } from "#/components/theme-toggle"

export function Header() {
  const pathname = usePathname()

  const links = [
    { href: "/updates", label: "Updates" },
    { href: "/examples", label: "Examples" },
    { href: "/docs", label: "Docs" },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex relative h-36 items-center px-4 justify-center">
        {/* Left: Logo */ }
        <div className="absolute left-4 text-wrap top-0 w-min flex items-center">
          <Link href="/" className={ cn("flex items-center space-x-2",
            "text-muted-foreground hover:text-foreground",
            pathname === "/"
              ? "m-4 p-4"
              : "mx-4 px-4 py-4"
          ) }>
            <span className={ cn("font-heading font-bold",
              pathname === "/"
                ? "text-3xl sm:text-5xl"
                : "text-2xl sm:text-4xl"
            ) }>
              Cinematic Canvas
            </span>
          </Link>
        </div>

        {/* Center: Navigation */ }
        <nav className="hidden md:flex items-center gap-8">
          { links.map((link) => (
            <Link
              key={ link.href }
              href={ link.href }
              className={ cn(
                "text-sm font-medium uppercase tracking-widest transition-colors hover:text-primary",
                pathname.startsWith(link.href)
                  ? "text-foreground"
                  : "text-muted-foreground"
              ) }
            >
              { link.label }
            </Link>
          )) }
        </nav>

        {/* Right: Empty for now (Theme Toggle hidden) */ }
        <div className="absolute right-4 hidden md:flex items-center gap-2">
          {/* Theme toggle hidden as requested */ }
          {/* <ModeToggle /> */ }
        </div>
      </div>
    </header>
  )
}
