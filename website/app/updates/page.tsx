import { getAllUpdates } from "#/lib/updates"
import Link from "next/link"
import Image from "next/image"
import { cn } from "#/lib/utils"

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 pt-8 px-0 md:px-8">
          {updates.map((update, i) => {
            const isFirst = i === 0;

            const gridClasses = cn(
              "group relative flex flex-col justify-end overflow-hidden md:rounded-lg transition-all duration-100",
              "card-cinematic-glass card-cinematic-glass md:border-gradient border-0 border-y md:border",
              isFirst
                ? "col-span-full aspect-video"
                : "col-span-full",
            );

            return (
              <Link
                key={update.slug}
                href={`/updates/${update.slug}`}
                className={cn(gridClasses, "btn-cinematic w-full min-h-[300px]")}
              >
                {/* Cover Image Background */}
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden z-0">
                  <Image
                    src={update.frontmatter.coverImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop'}
                    alt={update.frontmatter.title}
                    fill
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                    className="grayscale-[30%] btn-cinematic-img"
                    priority={i < 6}
                  />
                </div>

                {/* Gradient Overlay for Text Readability */}
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

                {/* Content Overlay */}
                <div className="relative z-20 p-6 flex flex-col justify-end h-full w-full pointer-events-none">
                  <div className="flex flex-col transform transition-transform duration-100">
                    <p className="text-xs font-medium text-white/80 md:text-white/70 uppercase tracking-widest mb-1">
                      {update.frontmatter.date && new Date(update.frontmatter.date).toLocaleDateString(undefined, {
                        year: 'numeric', month: 'long', day: 'numeric'
                      })} • {update.authors[0].name}
                    </p>
                    <h2 className="text-3xl md:text-3xl font-heading text-white drop-shadow-md">
                      {update.frontmatter.title}
                    </h2>
                    <p className="font-normal text-white/60">
                      {update.frontmatter.description}
                    </p>
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
