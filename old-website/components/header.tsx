"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "#/lib/utils"
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "./ui/button";

export function Header() {
  const pathname = usePathname()
  const [isScrolled, setIsScrolled] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isHome = pathname === "/";
  const isUpdates = pathname.startsWith("/updates");

  return (
    <nav id="main-nav" className={cn(
      "fixed top-0 left-0 right-0 z-[100] h-[var(--nav-height)] flex items-center justify-between px-5 md:px-10 lg:px-16 transition-all duration-400",
      isScrolled ? "bg-background/90 backdrop-blur-md border-b border-border" : "bg-transparent border-b border-transparent"
    )}>
      <Link href="/" className="flex items-center gap-2.5 text-[var(--color-warm)] no-underline">
        <div className="w-8 h-8 md:w-7 md:h-7 bg-gradient-to-br from-[var(--color-gold)] to-[var(--color-accent-red)]" style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}></div>
        <span className="font-heading text-[1.1rem] md:text-[1.05rem] font-medium tracking-wide">Cinematic Canvas</span>
      </Link>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}>
          <Bell className="w-5 h-5" />
        </Button>
        {isNotificationsOpen && (
          <div className="absolute top-16 right-5 bg-card border border-border p-4 shadow-lg w-64">
            <p>No new notifications</p>
          </div>
        )}
      </div>

      {isHome ? (
        <ul className="hidden md:flex items-center gap-8 list-none m-0 p-0">
          <li><Link href="#features" className="text-muted-foreground text-[0.85rem] uppercase tracking-widest hover:text-[var(--color-warm)] transition-colors duration-200">Features</Link></li>
          <li><Link href="#workflow" className="text-muted-foreground text-[0.85rem] uppercase tracking-widest hover:text-[var(--color-warm)] transition-colors duration-200">Workflow</Link></li>
          <li><Link href="/updates" className="text-muted-foreground text-[0.85rem] uppercase tracking-widest hover:text-[var(--color-warm)] transition-colors duration-200">Updates</Link></li>
          <li><Link href="#pricing" className="text-muted-foreground text-[0.85rem] uppercase tracking-widest hover:text-[var(--color-warm)] transition-colors duration-200">Pricing</Link></li>
          <li>
            <Link href="#" className="bg-[var(--color-gold)] text-black px-5 py-2 rounded-none font-medium text-[0.8rem] transition-all hover:bg-[var(--color-gold-light)] hover:-translate-y-px">
              Start Free
            </Link>
          </li>
        </ul>
      ) : isUpdates ? (
        <div className="flex items-center">
          <Link href="/" className="font-mono text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-2 hover:text-[var(--color-warm)] transition-colors before:content-['←']">
            Back to Home
          </Link>
        </div>
      ) : (
        <ul className="hidden md:flex items-center gap-8 list-none m-0 p-0">
          <li><Link href="/docs" className="text-muted-foreground text-[0.85rem] uppercase tracking-widest hover:text-[var(--color-warm)] transition-colors duration-200">Docs</Link></li>
          <li><Link href="/updates" className="text-muted-foreground text-[0.85rem] uppercase tracking-widest hover:text-[var(--color-warm)] transition-colors duration-200">Updates</Link></li>
          <li>
            <Link href="https://github.com/digitalcreationsco/cinematic-canvas" target="_blank" className="text-muted-foreground text-[0.85rem] uppercase tracking-widest hover:text-[var(--color-warm)] transition-colors duration-200">GitHub</Link>
          </li>
        </ul>
      )}
    </nav>
  )
}
