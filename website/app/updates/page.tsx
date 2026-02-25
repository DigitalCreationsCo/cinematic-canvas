import { getAllUpdates } from "#/lib/updates"
import Link from "next/link"
import { cn } from "#/lib/utils"

export default async function UpdatesPage() {
  const updates = await getAllUpdates()

  return (
    <div className="min-h-screen bg-background pt-24 pb-32 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-heading tracking-tighter">
            Updates
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            The latest news, features, and stories from the Cinematic Canvas team.
          </p>
        </div>

        {/* Magazines on a tabletop grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12 mt-16 px-4">
          {updates.map((update, i) => {
            // Non-uniform grid logic
            const isLarge = i % 5 === 0
            const rotation = i % 3 === 0 ? '-rotate-1' : i % 2 === 0 ? 'rotate-1' : 'rotate-0'
            const offset = i % 2 === 0 ? 'translate-y-4' : '-translate-y-4'

            return (
              <Link 
                key={update.slug}
                href={`/updates/${update.slug}`}
                className={cn(
                  "group relative flex flex-col justify-end overflow-hidden rounded-md glass-brick border-gradient cinematic-card transition-all duration-500 hover:scale-105 hover:z-10",
                  isLarge ? "md:col-span-2 aspect-[16/9]" : "aspect-[3/4] md:aspect-square lg:aspect-[3/4]",
                  rotation,
                  offset
                )}
              >
                {/* Cover Image Background */}
                <div 
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                  style={{ 
                    backgroundImage: `url(${update.frontmatter.coverImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop'})` 
                  }}
                />
                
                {/* Gradient Overlay for Text Readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Content Overlay */}
                <div className="relative z-10 p-6 flex flex-col justify-end h-full w-full pointer-events-none">
                  <div className="flex flex-col gap-2 transform transition-transform duration-500 group-hover:-translate-y-2">
                    <p className="text-sm font-medium text-white/70 uppercase tracking-widest">
                      {update.frontmatter.date && new Date(update.frontmatter.date).toLocaleDateString(undefined, {
                        year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </p>
                    <h2 className={cn(
                      "font-heading font-bold text-white leading-tight drop-shadow-md",
                      isLarge ? "text-3xl md:text-5xl" : "text-2xl"
                    )}>
                      {update.frontmatter.title}
                    </h2>
                    
                    {/* Authors */}
                    {update.authors && update.authors.length > 0 && (
                      <div className="flex items-center gap-3 mt-4">
                        <div className="flex -space-x-2">
                          {update.authors.map((author) => (
                            <img 
                              key={author.name}
                              src={author.image_url || `https://avatar.vercel.sh/${author.name}.png`}
                              alt={author.name}
                              className="w-8 h-8 rounded-full border-2 border-black object-cover"
                            />
                          ))}
                        </div>
                        <span className="text-sm font-medium text-white/90">
                          {update.authors.map(a => a.name).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
