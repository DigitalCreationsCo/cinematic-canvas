import { getAllUpdates } from "#/lib/updates"
import Link from "next/link"
import Image from "next/image"
import { cn } from "#/lib/utils"

// Helper for deterministic "random" values based on a string seed
const getSeed = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

export default async function UpdatesPage() {
  const updates = await getAllUpdates()

  return (
    <div className="w-full overflow-x-hidden min-h-screen bg-background pt-24 pb-32">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 md:px-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-heading ">
              Updates
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              The latest updates from Cinematic Canvas.
            </p>
          </div>
        </div>

        <div className="border-b mx-4 md:mx-8" />
        <div className="grid grid-cols-1 lg:grid-cols-18 gap-y-4 lg:gap-y-0 lg:gap-x-8 pt-8 px-0 md:px-8">
          { updates.map((update, i) => {
            const seed = getSeed(update.slug || i.toString());

            // 1. Logic for "Magazine" layout variety
            const isHero = i % 10 === 0;    // Every 10th item is a massive spread
            const isTall = seed % 7 === 1;  // Randomly tall items
            const isOffset = seed % 5 === 0; // Randomly start at a specific column

            // 2. Map seeds to specific CSS Grid classes
            const gridClasses = cn(
              "group relative flex flex-col justify-end overflow-hidden md:rounded-lg transition-all duration-100",
              "glass-brick cinematic-card md:border-gradient border-0 border-y md:border",
              // Layout Logic
              isHero
                ? "lg:col-span-8 lg:col-start-3 aspect-video lg:aspect-video"
                : isTall
                  ? "lg:col-span-8 lg:row-span-2 aspect-video lg:aspect-[9/16]"
                  : "lg:col-span-8 aspect-video lg:aspect-[4/5]",
              // The "Tabletop Offset" logic
              !isHero && isOffset ? "lg:col-start-3" : "lg:col-start-auto",
            );

            // 3. Margin Jitter for "Floating" effect
            const marginTop = isHero ? 0 : (seed % 60); // 0px to 60px offset

            return (
              <Link 
                key={update.slug}
                href={ `/updates/${update.slug}` }
                style={ { '--mt-offset': `${marginTop}px` } as React.CSSProperties }
                className={ cn(gridClasses,
                  "w-full max-lg:!mt-0 lg:[margin-top:var(--mt-offset)] min-h-[300px] lg:min-h-0"
                ) }
              >
                {/* Cover Image Background */}
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden z-0">
                  <Image
                    src={update.frontmatter.coverImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop'}
                    alt={update.frontmatter.title}
                    fill
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                    className="grayscale-[20%] group-hover:grayscale-0 transition-transform duration-500 group-hover:scale-105"
                    priority={i < 6}
                  />
                </div>
                
                {/* Gradient Overlay for Text Readability */}
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-black/20 opacity-80 group-hover:opacity-100 transition-opacity duration-300" />
                
                {/* Content Overlay */}
                <div className="relative z-20 p-6 flex flex-col justify-end h-full w-full pointer-events-none">
                  <div className="flex flex-col gap-2 transform transition-transform duration-100">
                    <p className="text-xs font-mono font-normal tracking-wide text-white/70 uppercase">
                      {update.frontmatter.date && new Date(update.frontmatter.date).toLocaleDateString(undefined, {
                        year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </p>
                    <h2 className={cn(
                      "font-heading text-white leading-tight drop-shadow-md",
                      isHero ? "text-2xl lg:text-3xl" : "text-2xl lg:text-2xl"
                    )}>
                      {update.frontmatter.title}
                    </h2>
                    <p className="font-normal text-muted-foreground">
                      { update.frontmatter.description }
                    </p>
                    
                    {/* Authors */}
                    {update.authors && update.authors.length > 0 && (
                      <div className="flex items-center gap-3 mt-4">
                        <div className="flex -space-x-2">
                          {update.authors.map((author) => (
                            <img 
                              key={author.name}
                              src={author.image_url || `https://avatar.vercel.sh/${author.name}.png`}
                              alt={author.name}
                              className="w-6 h-6 rounded-full border-2 border-black object-cover"
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
