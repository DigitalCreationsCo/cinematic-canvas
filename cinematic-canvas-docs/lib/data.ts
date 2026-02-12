export interface VideoExample {
  id: string
  title: string
  description: string
  thumbnailUrl: string
  videoUrl: string
}

export async function fetchVideoExamples(): Promise<VideoExample[]> {
  // Mock fetch
  // In future, replace with real fetch(endpoint)
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        {
          id: "1",
          title: "Cinematic Journey",
          description: "A generative video exploring cinematic landscapes.",
          thumbnailUrl: "https://images.unsplash.com/photo-1478720568477-152d9b164e63?w=800&auto=format&fit=crop&q=60",
          videoUrl: "#", // Placeholder
        },
        {
          id: "2",
          title: "Neon Dreams",
          description: "Cyberpunk aesthetic generated in real-time.",
          thumbnailUrl: "https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=800&auto=format&fit=crop&q=60",
          videoUrl: "#",
        },
        {
          id: "3",
          title: "Abstract Flow",
          description: "Fluid dynamics simulation visualised.",
          thumbnailUrl: "https://images.unsplash.com/photo-1518640467707-6811f4a6ab73?w=800&auto=format&fit=crop&q=60",
          videoUrl: "#",
        }
      ])
    }, 500)
  })
}
