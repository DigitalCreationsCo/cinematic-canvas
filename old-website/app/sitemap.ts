import type { MetadataRoute } from 'next'
export const dynamic = 'force-static';
import { PageRoutes } from '#/lib/pageroutes';
import { Settings } from '#/types/settings'

export default function sitemap(): MetadataRoute.Sitemap {
  return PageRoutes.map((page) => ({
    url: `${Settings.metadataBase}${page.href}`,
    lastModified: new Date().toISOString(),
    changeFrequency: 'monthly',
    priority: 0.8,
  }))
}
