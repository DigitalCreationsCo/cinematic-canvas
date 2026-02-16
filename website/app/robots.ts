import type { MetadataRoute } from 'next'
export const dynamic = 'force-static'

import { Settings } from '#/types/settings'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: `${Settings.metadataBase}/sitemap.xml`,
  }
}
