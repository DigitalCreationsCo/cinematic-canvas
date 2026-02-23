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
