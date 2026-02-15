import { getUpdateBySlug, getAllUpdates } from "@/lib/mdx"
import { MDXRemote } from "next-mdx-remote/rsc"
import { notFound } from "next/navigation"

interface UpdatePageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateStaticParams() {
  const updates = await getAllUpdates()
  return updates.map((update) => ({
    slug: update.slug,
  }))
}

export default async function UpdatePage({ params }: UpdatePageProps) {
  const resolvedParams = await params
  try {
    const update = await getUpdateBySlug(resolvedParams.slug)

    return (
      <article className="container relative max-w-3xl py-6 lg:py-10">
        <div>
          {update.frontmatter.date && (
            <time
              dateTime={update.frontmatter.date}
              className="block text-sm text-muted-foreground"
            >
              Published on {new Date(update.frontmatter.date).toLocaleDateString()}
            </time>
          )}
          <h1 className="mt-2 inline-block font-heading text-4xl leading-tight lg:text-5xl">
            {update.frontmatter.title}
          </h1>
        </div>
        <hr className="my-8" />
        <div className="prose dark:prose-invert max-w-none">
          <MDXRemote source={update.content} />
        </div>
      </article>
    )
  } catch (error) {
    notFound()
  }
}
