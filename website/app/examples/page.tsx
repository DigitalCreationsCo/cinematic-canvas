import { fetchVideos } from "#/lib/data";
import { VideoPlayer } from "#/components/ui/video-player";

export default async function ExamplesPage() {
  const examples = await fetchVideos()

  return (
    <div className="container mx-auto pb-8">
      <div className="flex flex-col items-start gap-4 md:flex-row md:justify-between md:gap-8 mb-8">
        <div className="flex-1 space-y-4">
          <h1 className="inline-block font-heading text-4xl tracking-tight lg:text-5xl">
            Examples
          </h1>
          <p className="text-xl text-foreground">
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
            <VideoPlayer 
              src={example.videoUrl} 
              poster={example.thumbnailUrl} 
              className="w-full h-full object-cover"
            />
            
            {/* Info */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white pointer-events-none z-10">
              <h3 className="font-bold text-lg">{example.title}</h3>
              <p className="text-sm text-gray-200 line-clamp-1">{example.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
