import { getUpdate, getAllUpdates } from "#/lib/updates"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cn } from "#/lib/utils"

export async function generateStaticParams() {
  const updates = await getAllUpdates()
  return updates.map((update) => ({
    slug: update.slug,
  }))
}

export default async function UpdatePage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const update = await getUpdate(params.slug)
  const allUpdates = await getAllUpdates()

  if (!update) {
    notFound()
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background text-foreground px-4 md:px-8 py-16 md:py-24 relative overflow-x-hidden">
      
      <img 
        className="fixed top-0 left-0 w-full h-[120px] object-cover z-[49]" 
        src={update.frontmatter.coverImage} 
      />
      
      {/* Left Sidebar */}
      <aside className="w-full md:w-64 flex-shrink-0 md:pr-8 mb-12 md:mb-0 hidden md:block border-r border-border/50">
        <h3 className="font-medium text-sm uppercase tracking-[0.2em] text-muted-foreground mb-6">
          All Updates
        </h3>
        <nav className="flex flex-col space-y-4">
          {allUpdates.map((u) => {
            const isActive = u.slug === update.slug
            return (
              <Link 
                key={u.slug} 
                href={`/updates/${u.slug}`}
                className={cn(
                  "group flex flex-col transition-all  border-l-2 pl-4 py-1",
                  isActive 
                    ? "border-primary text-foreground" 
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                <span className={cn(
                  "font-medium text-sm leading-tight transition-transform",
                )}>
                  {u.frontmatter.title}
                </span>
                <span className="text-xs uppercase tracking-wider mt-1 opacity-70">
                  {new Date(u.frontmatter.date).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </span>
              </Link>
            )
          })}
        </nav>
      </aside>

      <main className="relative flex w-full">
        <div className="absolute h-40 md:h-64 w-full top-0 left-0 bg-gradient-to-b from-transparent to-background z-0" />
        <article className="relative z-10 w-full mx-auto space-y-8 mt-16 md:mt-24 md:ml-12 lg:ml-24 max-w-3xl">
          <header className="space-y-4 pb-8 border-b border-border/50">
            <time className="text-sm uppercase tracking-[0.2em] text-muted-foreground block">
              {new Date(update.frontmatter.date).toLocaleDateString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric'
              })}
            </time>
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl  leading-tight drop-shadow-md text-balance">
              {update.frontmatter.title}
            </h1>
            
            {update.authors && update.authors.length > 0 && (
              <div className="flex items-center gap-3 pt-4">
                <div className="flex -space-x-2">
                  {update.authors.map((author) => (
                    <img 
                      key={author.name}
                      src={author.image_url || `https://avatar.vercel.sh/${author.name}.png`}
                      alt={author.name}
                      className="w-10 h-10 rounded-full border-2 border-background object-cover shadow-sm"
                    />
                  ))}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {update.authors.map(a => a.name).join(', ')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {update.authors.map(a => a.title).filter(Boolean).join(', ')}
                  </span>
                </div>
              </div>
            )}
          </header>
          
          <div className="prose prose-invert prose-lg max-w-none text-foreground/90 font-light leading-relaxed">
            {update.content}
          </div>
        </article>
      </main>

    </div>
  )
}
