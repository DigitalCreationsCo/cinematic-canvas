import { getAllUpdates } from "#/lib/mdx"
import Link from "next/link"

export default async function UpdatesPage() {
  const updates = await getAllUpdates()

  return (
    <div className="container mx-auto pb-8">
      <div className="flex flex-col items-start gap-4 md:flex-row md:justify-between md:gap-8">
        <div className="flex-1 space-y-4">
          <h1 className="inline-block font-heading text-4xl tracking-tight lg:text-5xl">
            Updates
          </h1>
          <p className="text-xl text-foreground">
            Latest news and changelog.
          </p>
        </div>
      </div>
      <hr className="my-8" />
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {updates.map((update) => (
          <article
            key={update.slug}
            className="group relative flex flex-col space-y-2 border border-border p-6 rounded-lg bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow"
          >
            {update.frontmatter.date && (
              <p className="text-sm text-muted-foreground">
                {new Date(update.frontmatter.date).toLocaleDateString()}
              </p>
            )}
            <h2 className="text-2xl font-bold">{update.frontmatter.title}</h2>
            {update.frontmatter.description && (
              <p className="text-muted-foreground">
                {update.frontmatter.description}
              </p>
            )}
            <Link href={`/updates/${update.slug}`} className="absolute inset-0">
              <span className="sr-only">Read more</span>
            </Link>
          </article>
        ))}
      </div>
    </div>
  )
}
