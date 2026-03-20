import Image from 'next/image'
import Link from 'next/link'

import { Settings } from '#/types/settings'
import { links } from '#/config/links'

export function Footer() {
  return (
    <footer className="w-full relative z-10 flex flex-col text-sm text-foreground">
      {/* {Settings.branding !== false && (
        <div className="hidden items-center md:block">
          <Link
            className="font-semibold"
            href="https://cinematic-canvas.com"
            title="Cinematic Canvas"
            aria-label="Cinematic Canvas"
            target="_blank"
          >
            <Image
              src="/logo.png"
              alt="Cinematic Canvas logo"
              title="Cinematic Canvas logo"
              aria-label="Cinematic Canvas logo"
              priority={false}
              width={30}
              height={30}
            />
</Link>
</div>
      ) } */}

      <div className="py-12 px-4 lg:px-8 w-fit md:max-w-6xl mx-auto">
        <div className="mx-auto flex flex-col-reverse md:flex-row-reverse justify-center md:items-center text-xs text-muted-foreground gap-4">
          <p className="md:mx-0">&copy; {new Date().getFullYear()} Cinematic Canvas.</p>
          <div className="grid grid-flow-row md:grid-flow-col auto-cols-max gap-4 mb-4 md:mb-0 items-center">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

    </footer>
  )
}
