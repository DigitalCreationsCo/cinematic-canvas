"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "#/lib/utils"
import { Github } from "lucide-react";
import { useRef, useState } from "react";
import { MobileNav } from "./MobileNav"

export function Header() {
  const pathname = usePathname()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ isMobileNavOpen, setIsMobileNavOpen ] = useState(false);

  const links = [
    { href: "/docs", label: "Docs" },
    { href: "/updates", label: "Updates" },
    { href: "/examples", label: "Gallery" },
    { href: "https://github.com/digitalcreationsco/cinematic-canvas", label: "Github", icon: <Github className="w-5 h-5" /> }
  ]

  const isHome = pathname === "/"

  return (
    <header className="sticky top-0 w-full border-b border-border/60 bg-background/50 backdrop-blur card-cinematic-glass rounded-none z-50">
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
        <div className={ cn(
          "absolute left-8 top-1/2 -translate-y-1/2 flex items-center max-w-[30%] transition-opacity",
          isMobileNavOpen && "opacity-0 pointer-events-none"
        ) }>
          <Link href="/" className={cn(
            "flex w-min items-center space-x-2 transition-opacity hover:opacity-80 duration-100 text-foreground"
          )}>
            <span className={cn(
              "font-heading tracking-tight drop-shadow-md text-wrap break-words uppercase text-4xl md:text-6xl transition-all duration-100 origin-top-left",
              isHome ? "hover:scale-3d" : "scale-[65%]"
            )}>
              Cinematic Canvas
            </span>
          </Link>
        </div>
      </div>

      <nav className="hidden md:flex py-2 px-6 items-end">
          {links.map((link) => (
            <Link
              key={link.href}
              href={ link.href }
              target={ link.label === "Github" ? "_blank" : "_self" }
              className={cn(
                "px-4 text-font-medium uppercase tracking-[0.2em] transition-all hover:text-white btn-cinematic",
                link.icon ? 'px-3 pb-1.5 pt-2' : 'py-2',
                pathname.startsWith(link.href)
                  ? "text-white"
                  : "text-muted-foreground"
              )}
            >
              <>
                <span className="btn-cinematic-text">{ link.icon || link.label }</span>
                <span className="sr-only">{ link.label }</span>
              </>
            </Link>
          ))}
        </nav>

      <div className="md:hidden">
        <MobileNav
          isOpen={ isMobileNavOpen }
          setIsOpen={ setIsMobileNavOpen }
          links={ links } />
      </div>
    </header>
  )
}
