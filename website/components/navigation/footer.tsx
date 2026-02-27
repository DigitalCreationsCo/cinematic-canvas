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

      <div className="w-full py-12 px-4 lg:px-8">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-end text-xs text-muted-foreground">
          <p>&copy; { new Date().getFullYear() } Cinematic Canvas. All rights reserved.</p>
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 items-center">
            <Link href="/updates" className="uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Updates</Link>
            <Link href="/docs" className="uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Docs</Link>
            <Link href="/examples" className="uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Gallery</Link>
            <Link href="https://github.com/AndresB/cinematic-canvas" className="hover:text-foreground transition-colors">GitHub</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Twitter</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Discord</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
