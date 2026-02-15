import Link from "next/link"

export default function Home() {
  return (
    <div className="flex flex-1 min-h-full flex-col items-center justify-end text-center px-4 py-16 md:py-24 overflow-hidden">
      <div className="space-y-6 max-w-4xl mx-auto flex flex-col items-center">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-heading tracking-tighter text-foreground">
          Experience the future of <br className="hidden md:block" />
          <span className="text-primary">generative cinema</span>.
        </h1>

        <p className="md:text-xl text-foreground max-w-[600px]">
          Dive into the documentation, check the latest updates, or explore the gallery.
          Building the next generation of visual storytelling tools.
        </p>

        <div className="flex flex-col sm:flex-row gap-6 pt-4">
          <Link
            href="/docs" 
            className="inline-flex h-16 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium uppercase tracking-widest text-primary-foreground shadow transition-all hover:bg-primary/90 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            Documentation
          </Link>
          <Link
            href="/examples" 
            className="inline-flex h-16 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium uppercase tracking-widest shadow-sm transition-all hover:bg-accent hover:text-accent-foreground hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            View Examples
          </Link>
        </div>
      </div>
    </div>
  )
}
