"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { LuChevronDown, LuChevronRight } from "react-icons/lu"

import { cn } from '#/lib/utils'

export interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: {
    title: string
    href?: string
    items?: SidebarNavProps["items"]
  }[]
}

function SidebarNavItem({ item, level = 0 }: { item: SidebarNavProps["items"][0], level?: number }) {
  const pathname = usePathname()
  const hasItems = item.items && item.items.length > 0
  const isActive = item.href && pathname === item.href
  const isChildActive = item.items?.some(subItem => pathname === subItem.href)

  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (isChildActive || isActive) {
      setIsOpen(true)
    }
  }, [isChildActive, isActive])

  if (hasItems) {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex w-full items-center justify-between rounded-none px-2 py-1 text-sm font-semibold hover:bg-accent hover:text-accent-foreground",
            isOpen && "text-primary"
          )}
        >
          {item.title}
          {isOpen ? (
            <LuChevronDown className="h-4 w-4" />
          ) : (
            <LuChevronRight className="h-4 w-4" />
          )}
        </button>
        {isOpen && (
          <div className="ml-4 border-l pl-4">
            {item.items?.map((subItem, index) => (
              <SidebarNavItem key={index} item={subItem} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href || "#"}
      className={cn(
        "block rounded-none px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground",
        isActive
          ? "font-medium text-primary"
          : "text-muted-foreground"
      )}
    >
      {item.title}
    </Link>
  )
}

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  return (
    <nav className={cn("grid items-start gap-2", className)} {...props}>
      {items.map((item, index) => (
        <SidebarNavItem key={index} item={item} />
      ))}
    </nav>
  )
}
