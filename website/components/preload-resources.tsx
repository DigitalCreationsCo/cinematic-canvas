"use client"

import { useEffect } from "react"

const CRITICAL_IMAGES = {
  updates: [
    "/images/2026-03-20-cover.png",
    "/images/2026-03-05-cover.png",
    "/images/2026-02-25-cover.png",
    "/images/2026-01-27-cover.png",
    "/images/2026-01-22-cover.png",
    "/images/2026-01-14-cover.png",
  ],
  gallery: [
    "https://images.unsplash.com/photo-1557672172-298e090bd0f1?q=80&w=2000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=2000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1682687220063-4742bd7fd538?q=80&w=2000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1506443432602-ac2fcd6f54e0?q=80&w=2000&auto=format&fit=crop",
  ],
}

interface PreloadResourcesProps {
  children: React.ReactNode
}

export function PreloadResources({ children }: PreloadResourcesProps) {
  useEffect(() => {
    const preloadImage = (src: string) => {
      new Image().src = src
    }

    CRITICAL_IMAGES.updates.forEach(preloadImage)
    CRITICAL_IMAGES.gallery.forEach(preloadImage)

    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => {}, { timeout: 1000 })
    }
  }, [])

  return <>{children}</>
}

export function PreloadHints() {
  return (
    <>
      {CRITICAL_IMAGES.updates.map((src, i) => (
        <link
          key={`preload-update-${i}`}
          rel="preload"
          as="image"
          href={src}
          fetchPriority={i < 3 ? "high" : "low"}
        />
      ))}

      {CRITICAL_IMAGES.gallery.map((src, i) => (
        <link
          key={`preload-gallery-${i}`}
          rel="preload"
          as="image"
          href={src}
          fetchPriority={i < 2 ? "high" : "low"}
        />
      ))}

      <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://images.unsplash.com" />
    </>
  )
}
