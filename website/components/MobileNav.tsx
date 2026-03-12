import React from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '#/lib/utils';

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
    <div className="z-50 fixed top-12 right-6">
      <button onClick={ () => setIsOpen(!isOpen) } className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-10">
        { isOpen ? <X className="w-10 h-10" /> : <Menu className="w-10 h-10" /> }
        <span className="sr-only">Menu Button</span>
      </button>

      {
        isOpen &&
        <div className="w-full h-full bg-card backdrop-blur-lg shadow-xl flex flex-col gap-6">
          <nav className="flex flex-col gap-6 p-8 mt-16">
            { links.map((link) => (
              <Link
                key={ link.href }
                href={ link.href }
                className={
                  cn(
                    "text-2xl font-medium tracking-wide transition-colors hover:text-foreground",
                    pathname.startsWith(link.href) ? "text-foreground" : "text-muted-foreground"
                  ) }
              >
                { link.label }
              </Link>
            )) }
          </nav>
        </div >
      }
    </div >
  );
};