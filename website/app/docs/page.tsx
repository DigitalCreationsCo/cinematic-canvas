import { getDocBySlug } from "#/lib/mdx"
import { MDXRemote } from "next-mdx-remote/rsc"

export default async function DocsIndexPage() {
  const doc = await getDocBySlug(["intro"])
  
  if (!doc) {
    return <div>No introduction document found.</div>
  }

  return (
    <article className="mx-auto prose dark:prose-invert max-w-none">
      <h1>{ doc.frontmatter.title }</h1>
      <MDXRemote source={doc.content} />
    </article>
  )
}
