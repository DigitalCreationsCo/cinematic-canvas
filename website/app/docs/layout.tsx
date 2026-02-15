import { getAllDocs } from "#/lib/mdx.js"
import { buildDocsTree } from "#/lib/nav.js"
import { SidebarNav } from "#/components/sidebar-nav.js"

interface DocsLayoutProps {
  children: React.ReactNode
}

export default async function DocsLayout({ children }: DocsLayoutProps) {
  const docs = await getAllDocs()
  const sidebarNav = buildDocsTree(docs)

  return (
    <div className="container mx-auto pb-8 flex-1 items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
      <aside className="fixed top-14 z-30 -ml-2 hidden h-[calc(100vh-3.5rem)] w-full shrink-0 md:sticky md:block">
        <div className="h-full overflow-y-auto pr-6 pb-8">
          <SidebarNav items={sidebarNav} />
        </div>
      </aside>
      <main className="relative pb-8 lg:gap-10 xl:grid xl:grid-cols-[1fr_300px]">
        <div className="mx-auto w-full min-w-0">
          {children}
        </div>
      </main>
    </div>
  )
}
