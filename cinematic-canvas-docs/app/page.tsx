import Link from "next/link"

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] text-center px-4">
      <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-6">
        Cinematic Canvas
      </h1>
      <p className="text-xl text-muted-foreground max-w-[600px] mb-8">
        Experience the future of generative cinema. Dive into the documentation, check the latest updates, or explore the gallery.
      </p>
      <div className="flex gap-4">
        <Link 
          href="/docs" 
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Documentation
        </Link>
        <Link 
          href="/examples" 
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          View Examples
        </Link>
      </div>
    </div>
  )
}
