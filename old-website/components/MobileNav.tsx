'use client'

import React from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '#/lib/utils';
import { motion } from 'framer-motion';

interface MobileNavProps {
  links: { href: string; label: string; }[];
  isOpen: boolean;
  setIsOpen: (arg: boolean) => void;
}

export function MobileNav({ isOpen, setIsOpen, links }: MobileNavProps) {
  const pathname = usePathname();

  // Close menu when route changes
  React.useEffect(() => {
    // Optional: lock body scroll when menu is open
    document.body.style.overflow = isOpen ? 'hidden' : '';
    // Cleanup function to reset scroll on unmount
    return () => { document.body.style.overflow = ''; };
  }, [ isOpen ]);

  // Close menu when route changes
  React.useEffect(() => {
    setIsOpen(false);
  }, [ pathname, setIsOpen ]);

  return (
    <div className="z-50 fixed w-full top-12 right-0">
      <button onClick={ () => setIsOpen(!isOpen) } className="absolute top-4 right-10 text-muted-foreground hover:text-foreground z-10">
        { isOpen ? <X className="w-10 h-10" /> : <Menu className="w-10 h-10" /> }
        <span className="sr-only">Menu Button</span>
      </button>

      {
        isOpen &&
        <motion.div
          initial={ { opacity: 0, y: -100 } }
          transition={ {
            type: "spring",
            stiffness: 260,
            damping: 20,
            duration: 0.01,
            ease: "easeInOut"
          } }
          animate={ { opacity: 1, y: 0 } }
          exit={ { opacity: 0, y: 100 } }
          className="w-full h-full bg-card backdrop-blur-lg shadow-xl flex flex-col gap-6">
          <nav className="flex flex-col gap-6 p-8">
            { links.map((link) => (
              <Link
                key={ link.href }
                href={ link.href }
                className={
                  cn(
                    "text-sm uppercase tracking-[0.2em] transition-all",
                    pathname.startsWith(link.href) ? "text-foreground" : "text-muted-foreground"
                  ) }
              >
                { link.label }
              </Link>
            )) }
          </nav>
          </motion.div >
      }
    </div >
  );
};