import type { MetadataRoute } from 'next'
import { PageRoutes } from '#/lib/pageroutes.js';
import { Settings } from '#/types/settings.js'

export default function sitemap(): MetadataRoute.Sitemap {
  return PageRoutes.map((page) => ({
    url: `${Settings.metadataBase}${page.href}`,
    lastModified: new Date().toISOString(),
    changeFrequency: 'monthly',
    priority: 0.8,
  }))
}
