import { Routes } from '#/lib/pageroutes'
import { SidebarNav } from '#/components/sidebar-nav'

interface DocsLayoutProps {
  children: React.ReactNode
}

export default async function DocsLayout({ children }: DocsLayoutProps) {
  const sidebarNav = Routes.map((route) => {
    if ('spacer' in route) {
      return { title: '---', href: undefined, isSpacer: true }
    }

    const items = route.items?.map((item) => {
      if ('spacer' in item) return { title: '---', isSpacer: true }
      return {
        title: item.title,
        href: `/docs${route.href}${item.href}`,
      }
    })

    return {
      title: route.title,
      href: route.noLink ? undefined : `/docs${route.href}`,
      items,
    }
  }).filter((item) => !('isSpacer' in item))

  return (
    <div className="mx-auto p-4 md:pt-24 sm:px-6 lg:px-8 pb-8 flex-1 items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
      <aside className="fixed top-14 z-30 -ml-2 hidden h-[calc(100vh-3.5rem)] w-full shrink-0 md:sticky md:block">
        <div className="h-full overflow-y-hidden hover:overflow-y-auto overscroll-contain pr-6 pb-8">
          <h3 className="font-medium text-sm uppercase tracking-[0.2em] text-muted-foreground mb-6">
            Documentation
          </h3>
          <SidebarNav items={sidebarNav} />
        </div>
      </aside>
      <div className="md:hidden block mb-6 w-full">
        <details className="p-4 rounded-none">
          <summary className="font-bold cursor-pointer outline-none uppercase">Documentation</summary>
          <div className="mt-4 pb-4">
            <SidebarNav items={sidebarNav} />
          </div>
        </details>
      </div>
      <main className="w-full max-w-6xl relative pb-8 lg:gap-10 xl:grid xl:grid-cols-[1fr_100px]">
        <div className="mx-auto w-full min-w-0">
          {children}
        </div>
      </main>
    </div>
  )
}
