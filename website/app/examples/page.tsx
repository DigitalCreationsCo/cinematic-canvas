"use client"

import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, X, Play } from "lucide-react"
import { cn } from "#/lib/utils"

// Needs client-side import for web components
if (typeof window !== "undefined") {
  require("media-chrome")
}

const EXAMPLES = [
  {
    id: 1,
    title: "Neon Echoes",
    creator: "Alex Vance",
    date: "Feb 10, 2026",
    thumbnail: "https://images.unsplash.com/photo-1557672172-298e090bd0f1?q=80&w=2000&auto=format&fit=crop",
    video: "https://cdn.pixabay.com/video/2021/08/04/83863-584732128_large.mp4"
  },
  {
    id: 2,
    title: "Quantum Drifter",
    creator: "Sarah Chen",
    date: "Jan 28, 2026",
    thumbnail: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=2000&auto=format&fit=crop",
    video: "https://cdn.pixabay.com/video/2020/05/24/40061-424694468_large.mp4"
  },
  {
    id: 3,
    title: "Abyssal Plains",
    creator: "Deep Sea Productions",
    date: "Jan 15, 2026",
    thumbnail: "https://images.unsplash.com/photo-1682687220063-4742bd7fd538?q=80&w=2000&auto=format&fit=crop",
    video: "https://cdn.pixabay.com/video/2021/08/04/83863-584732128_large.mp4"
  },
  {
    id: 4,
    title: "Solar Winds",
    creator: "Helios Studio",
    date: "Dec 30, 2025",
    thumbnail: "https://images.unsplash.com/photo-1506443432602-ac2fcd6f54e0?q=80&w=2000&auto=format&fit=crop",
    video: "https://cdn.pixabay.com/video/2020/05/24/40061-424694468_large.mp4"
  },
]

export default function ExamplesPage() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const handleNext = () => {
    if (selectedIndex === null) return
    setSelectedIndex((selectedIndex + 1) % EXAMPLES.length)
  }

  const handlePrev = () => {
    if (selectedIndex === null) return
    setSelectedIndex((selectedIndex - 1 + EXAMPLES.length) % EXAMPLES.length)
  }

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIndex(null)
      if (e.key === "ArrowRight") handleNext()
      if (e.key === "ArrowLeft") handlePrev()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedIndex])

  return (
    <div className="min-h-screen bg-background pt-24 pb-32 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-heading tracking-tighter">
              Gallery
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Discover what creators are building with Cinematic Canvas.
            </p>
          </div>
          
          <div className="flex items-center inline-gap">
            <button 
              onClick={handlePrev}
              disabled={selectedIndex === null}
              className="p-3 rounded-full glass-brick btn-cinematic disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
              aria-label="Previous Video"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button 
              onClick={handleNext}
              disabled={selectedIndex === null}
              className="p-3 rounded-full glass-brick btn-cinematic disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
              aria-label="Next Video"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-8 pt-8">
          {EXAMPLES.map((example, i) => (
            <div 
              key={example.id}
              onClick={() => setSelectedIndex(i)}
              className="group relative cursor-pointer overflow-hidden rounded-lg aspect-video cinematic-card border-gradient btn-cinematic"
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
                style={{ backgroundImage: `url(${example.thumbnail})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform scale-50 group-hover:scale-100">
                <div className="w-16 h-16 rounded-full glass-brick flex items-center justify-center text-white">
                  <Play className="w-8 h-8 ml-1" />
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end transform transition-transform duration-300">
                <p className="text-xs font-medium text-white/70 uppercase tracking-widest mb-1">
                  {example.date} • {example.creator}
                </p>
                <h2 className="text-2xl md:text-3xl font-heading font-bold text-white drop-shadow-md">
                  {example.title}
                </h2>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Video Modal */}
      {selectedIndex !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 sm:p-12">
          <button 
            onClick={() => setSelectedIndex(null)}
            className="absolute top-6 right-6 p-3 rounded-full glass-brick text-white hover:bg-white/20 transition-colors z-[101]"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="w-full max-w-6xl aspect-video rounded-xl overflow-hidden shadow-2xl relative border border-white/10">
            {/* @ts-ignore */}
            <media-controller className="w-full h-full" style={{ "--media-background-color": "transparent" } as React.CSSProperties}>
              <video
                slot="media"
                src={EXAMPLES[selectedIndex].video}
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
              {/* @ts-ignore */}
              <media-control-bar className="backdrop-blur-md bg-black/40 px-2 py-1">
                {/* @ts-ignore */}
                <media-play-button></media-play-button>
                {/* @ts-ignore */}
                <media-time-range></media-time-range>
                {/* @ts-ignore */}
                <media-mute-button></media-mute-button>
                {/* @ts-ignore */}
                <media-volume-range></media-volume-range>
                {/* @ts-ignore */}
                <media-fullscreen-button></media-fullscreen-button>
              {/* @ts-ignore */}
              </media-control-bar>
            {/* @ts-ignore */}
            </media-controller>
          </div>
          
          <div className="absolute bottom-6 left-6 sm:bottom-12 sm:left-12 text-white">
            <h2 className="text-3xl font-heading font-bold drop-shadow-lg">{EXAMPLES[selectedIndex].title}</h2>
            <p className="text-white/70 text-lg">{EXAMPLES[selectedIndex].creator}</p>
          </div>
          
          <button 
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            className="absolute left-6 top-1/2 -translate-y-1/2 p-4 rounded-full glass-brick text-white hover:bg-white/20 transition-colors hidden sm:block"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          
          <button 
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="absolute right-6 top-1/2 -translate-y-1/2 p-4 rounded-full glass-brick text-white hover:bg-white/20 transition-colors hidden sm:block"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>
      )}
    </div>
  )
}
