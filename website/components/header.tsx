"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "#/lib/utils"
import { Github } from "lucide-react"
import { useRef } from "react"

export function Header() {
  const pathname = usePathname()
  const videoRef = useRef<HTMLVideoElement>(null)

  const links = [
    { href: "/updates", label: "Updates" },
    { href: "/examples", label: "Examples" },
    { href: "/docs", label: "Docs" },
  ]

  const isHome = pathname === "/"

  return (
    <header className="sticky top-0 w-full border-b border-border/60 bg-background/50 backdrop-blur glass-brick z-50">
      {/* Background Video for non-home pages */}
      {!isHome && (
        <div 
          className="absolute inset-0 overflow-hidden z-[-1] opacity-30 mix-blend-screen"
          onMouseEnter={() => videoRef.current?.play()}
          onMouseLeave={() => videoRef.current?.pause()}
        >
          <video
            ref={videoRef}
            src="https://cdn.pixabay.com/video/2021/08/04/83863-584732128_large.mp4"
            loop
            muted
            playsInline
            className="w-full h-full object-cover grayscale transition-transform duration-700 ease-out transform scale-105 hover:scale-100"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/90" />
        </div>
      )}

      <div className="flex relative items-center justify-center header-padding px-4 min-h-[120px]">
        {/* Left: Logo */}
        <div className="absolute left-8 top-1/2 -translate-y-1/2 flex items-center max-w-[30%]">
          <Link href="/" className={cn(
            "flex items-center space-x-2 transition-opacity hover:opacity-80 text-foreground"
          )}>
            <span className={cn(
              "font-heading font-bold tracking-tight drop-shadow-md text-balance",
              isHome ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"
            )}>
              Cinematic Canvas
            </span>
          </Link>
        </div>

        {/* Center: Navigation */}
        <nav className="hidden md:flex items-center inline-gap">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-4 py-2 text-sm font-medium uppercase tracking-[0.2em] transition-all hover:text-white btn-cinematic",
                pathname.startsWith(link.href)
                  ? "text-white"
                  : "text-muted-foreground"
              )}
            >
              <span className="btn-cinematic-text">{link.label}</span>
            </Link>
          ))}
        </nav>

        {/* Right: Github */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-4">
          <Link
            href="https://github.com/AndresB/cinematic-canvas"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors btn-cinematic inline-flex items-center justify-center rounded-full p-2 border border-border/50 bg-background/50 backdrop-blur"
          >
            <Github className="w-5 h-5" />
            <span className="sr-only">GitHub</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
