"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: {
    title: string
    href?: string
    items?: SidebarNavProps["items"]
  }[]
}

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <nav className={cn("grid items-start gap-2", className)} {...props}>
      {items.map((item, index) => {
        const isActive = item.href && pathname === item.href

        return (
          <div key={index} className="flex flex-col gap-2">
            {item.href ? (
              <Link
                href={item.href}
                className={cn(
                  "group flex w-full items-center rounded-md border border-transparent px-2 py-1 hover:underline",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {item.title}
              </Link>
            ) : (
              <h4 className="mb-1 rounded-md px-2 py-1 text-sm font-semibold">
                {item.title}
              </h4>
            )}
            {item.items?.length ? (
              <SidebarNav items={item.items} className="ml-4" />
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}
