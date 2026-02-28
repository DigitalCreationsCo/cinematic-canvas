import { getDocBySlug, getAllDocs } from '#/lib/mdx';
import { MDXRemote } from "next-mdx-remote/rsc"
import { notFound } from "next/navigation"
import { components } from '#/components/mdx-components'

interface DocPageProps {
  params: Promise<{
    slug: string[]
  }>
}

export async function generateStaticParams() {
  const docs = await getAllDocs()
  return docs.map((doc) => ({
    slug: doc.slug,
  }))
}

export default async function DocPage({ params }: DocPageProps) {
  const resolvedParams = await params
  try {
    const doc = await getDocBySlug(resolvedParams.slug)
    
    return (
      <article className="mx-auto prose dark:prose-invert max-w-none pb-12">
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight lg:text-5xl">
          {doc.frontmatter.title}
        </h1>
        {doc.frontmatter.description && (
          <p className="text-xl text-muted-foreground">{doc.frontmatter.description}</p>
        )}
        <hr className="my-6" />
        <MDXRemote source={doc.content} components={components} />
      </article>
    )
  } catch (error) {
    notFound()
  }
}
