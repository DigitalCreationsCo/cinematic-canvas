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
    <div className="flex flex-col md:flex-row min-h-screen bg-background text-foreground px-4 md:px-8 py-24 mx-auto max-w-7xl">
      
      {/* Left Sidebar */}
      <aside className="w-full md:w-64 flex-shrink-0 md:pr-8 mb-12 md:mb-0 hidden md:block border-r border-border/50">
        <h3 className="font-heading text-lg tracking-widest uppercase text-muted-foreground mb-6">
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
                  "group flex flex-col transition-all duration-300 border-l-2 pl-4 py-1",
                  isActive 
                    ? "border-primary text-foreground" 
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                <span className={cn(
                  "font-medium text-sm leading-tight transition-transform",
                  isActive ? "translate-x-1" : "group-hover:translate-x-1"
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

      {/* Main Content (60% width roughly) */}
      <main className="flex-1 md:ml-12 lg:ml-24 xl:ml-32">
        <article className="max-w-[60%] min-w-[300px] w-full mx-auto space-y-8">
          <header className="space-y-4 pb-8 border-b border-border/50">
            <time className="text-sm uppercase tracking-[0.2em] text-muted-foreground block">
              {new Date(update.frontmatter.date).toLocaleDateString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric'
              })}
            </time>
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold leading-tight drop-shadow-md text-balance">
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
