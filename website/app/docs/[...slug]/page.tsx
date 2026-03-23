import { getDocBySlug, getAllDocs } from '#/lib/mdx';
import { notFound } from "next/navigation"
import { compileMDX } from 'next-mdx-remote/rsc'

export const dynamic = 'force-dynamic';

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
  let doc;
  try {
    const resolvedParams = await params
    doc = await getDocBySlug(resolvedParams.slug);
  } catch (error) {
    console.error(error, 'Doc Page error');
    notFound();
  }
  
  const { content } = await compileMDX({
    source: doc.content,
    options: {
      parseFrontmatter: false,
    },
  })
  
  return (
    <article className="mx-auto prose dark:prose-invert max-w-none pb-12">
      <h1 className="mb-4 text-4xl tracking-tight lg:text-5xl">
        {doc.frontmatter.title}
      </h1>
      {doc.frontmatter.description && (
        <p className="text-xl text-muted-foreground">{doc.frontmatter.description}</p>
      )}
      <hr className="my-6" />
      {content}
    </article>
  )
}
