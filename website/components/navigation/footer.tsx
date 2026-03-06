import Image from 'next/image'
import Link from 'next/link'

import { Settings } from '#/types/settings'

export function Footer() {
  return (
    <footer className="w-full relative z-10 glass-brick border-t border-border/20 flex flex-col text-sm text-foreground">
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

      <div className="py-12 px-4 lg:px-8 w-fit md:w-6xl mx-auto">
        <div className="flex flex-col-reverse md:flex-row-reverse justify-left md:justify-between md:items-center text-xs text-muted-foreground">
          <p className="md:mx-0">&copy; { new Date().getFullYear() } Cinematic Canvas.</p>
          <div className="mx-auto md:mx-0 grid grid-flow-row grid-cols-3 auto-cols-max gap-4 mb-4 md:mb-0 md:gap-2 items-center">
            <Link href="/updates" className="uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Updates</Link>
            <Link href="/docs" className="uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Docs</Link>
            <Link href="/examples" className="uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Examples</Link>
            <Link href="https://github.com/AndresB/cinematic-canvas" className="hover:text-foreground transition-colors">GitHub</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Twitter</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Discord</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
