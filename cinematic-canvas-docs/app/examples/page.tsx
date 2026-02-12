import { fetchVideoExamples } from "@/lib/data"
import { Play } from "lucide-react"

export default async function ExamplesPage() {
  const examples = await fetchVideoExamples()

  return (
    <div className="container py-8 md:py-10">
      <div className="flex flex-col items-start gap-4 md:flex-row md:justify-between md:gap-8 mb-8">
        <div className="flex-1 space-y-4">
          <h1 className="inline-block font-heading text-4xl tracking-tight lg:text-5xl">
            Examples
          </h1>
          <p className="text-xl text-muted-foreground">
            A gallery of recent generated projects.
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {examples.map((example) => (
          <div 
            key={example.id} 
            className="group relative overflow-hidden rounded-xl bg-muted aspect-video shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1"
          >
            {/* Thumbnail Placeholder */}
            <div 
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
              style={{ backgroundImage: `url(${example.thumbnailUrl})` }}
            />
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm">
              <button className="rounded-full bg-white/20 p-4 hover:bg-white/40 transition-colors backdrop-blur-md border border-white/30">
                <Play className="w-8 h-8 text-white fill-white" />
              </button>
            </div>
            
            {/* Info */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white">
              <h3 className="font-bold text-lg">{example.title}</h3>
              <p className="text-sm text-gray-200 line-clamp-1">{example.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
