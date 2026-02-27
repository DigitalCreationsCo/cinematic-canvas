"use client"

import Link from "next/link"
import { useState, useRef } from "react"
import { cn } from "#/lib/utils"
import { Footer } from "#/components/navigation/footer";

export default function Home() {
  return (
    <div className="justify-center mx-auto relative min-h-screen flex flex-col items-center overflow-hidden bg-background">
      {/* Vignette & Video Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <video
          autoPlay
          loop
          muted
          playsInline
          src="https://cdn.pixabay.com/video/2020/05/24/40061-424694468_large.mp4"
          className="w-full h-full object-cover opacity-30 grayscale mix-blend-screen"
        />
        {/* Subtle vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] pointer-events-none" />
      </div>

      {/* Main Content */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 flex flex-col content-gap">
        
        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center text-center py-32 space-y-8">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-heading tracking-tighter text-foreground drop-shadow-xl">
            Conjure the <br className="hidden md:block" />
            <span className="text-primary opacity-90 drop-shadow-2xl">impossible.</span>
          </h1>
          <p className="md:text-xl text-muted-foreground max-w-2xl font-light leading-relaxed">
            Cinematic Canvas bridges the gap between raw imagination and finished frames. Build worlds, shape stories, and let generative intelligence handle the visual continuity.
          </p>
          <div className="flex flex-col md:flex-row gap-4 inline-gap pt-8">
            <Link
              href="/docs" 
              className="w-full flex-1 inline-flex h-16 items-center justify-center rounded-sm bg-primary px-10 text-sm font-medium uppercase tracking-widest text-primary-foreground shadow-lg transition-all hover:bg-white hover:text-black btn-cinematic border-gradient"
            >
              <span className="btn-cinematic-text">Read Docs</span>
            </Link>
            <Link
              href="/examples" 
              className="w-full flex-1 inline-flex h-16 items-center justify-center rounded-sm glass-brick px-10 text-sm font-medium uppercase tracking-widest text-foreground shadow-sm transition-all hover:bg-white/10 btn-cinematic"
            >
              <span className="btn-cinematic-text">Explore Gallery</span>
            </Link>
          </div>
        </section>

        {/* Core Feature Section */}
        <section className="py-24 text-center space-y-6">
          <h2 className="text-3xl md:text-5xl font-heading tracking-tight">
            Generative Continuity Engine
          </h2>
          <p className="md:text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Create cinematic worlds that evolve like your characters. Our engine ensures that lighting, atmosphere, and environmental details persist seamlessly from frame to frame, adapting to the narrative flow rather than resetting on every prompt.
          </p>
        </section>

        {/* Ecosystem Section */}
        <section className="py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="cinematic-card p-12 space-y-4">
              <h3 className="text-2xl font-heading tracking-tight">For Lone Visionaries</h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                Direct your entire film from a single interface. From storyboarding to final render, you have an intelligent crew at your fingertips ready to materialize your vision without the overhead of a massive production team.
              </p>
            </div>
            <div className="cinematic-card p-12 space-y-4">
              <h3 className="text-2xl font-heading tracking-tight">For Production Teams</h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                Unify your creative pipeline. Share assets, establish canonical visual styles, and let the continuity engine maintain coherence across multiple artists and parallel rendering workloads.
              </p>
            </div>
          </div>
        </section>

        {/* Case Studies Section */}
        <section className="py-24 space-y-12">
          <div className="text-center">
            <h2 className="text-3xl md:text-5xl font-heading tracking-tight">Tales of the Canvas</h2>
            <p className="mt-4 text-muted-foreground">Real stories from the generative frontier.</p>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <CaseStudy 
              title="Tailoring the Beat: Music Videos in 48 Hours" 
              subtitle="How a solo director delivered a complex, stylized music video for an indie band using generative continuity."
              image="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=2000&auto=format&fit=crop"
            />
            <CaseStudy 
              title="Producing the Unseen: An AI Feature Film" 
              subtitle="A small team used Cinematic Canvas to maintain consistent character appearances and complex environmental lighting across a 90-minute film."
              image="https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2000&auto=format&fit=crop"
            />
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 text-center flex flex-col items-center space-y-8">
          <h2 className="text-4xl md:text-6xl font-heading tracking-tighter">
            Your stage awaits.
          </h2>
          <Link
            href="/docs" 
            className="inline-flex h-16 items-center justify-center rounded-sm bg-primary px-12 text-sm font-medium uppercase tracking-widest text-primary-foreground shadow-2xl transition-all hover:bg-white hover:text-black btn-cinematic border-gradient"
          >
            <span className="btn-cinematic-text">Create with Cinematic Canvas</span>
          </Link>
        </section>

      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}

function CaseStudy({ title, subtitle, image }: { title: string, subtitle: string, image: string }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-md glass-brick border-gradient cursor-pointer transition-all duration-1000 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        isHovered ? "h-96" : "h-24"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{ backgroundImage: `url(${image})`, transform: isHovered ? 'scale(1.05)' : 'scale(1)' }}
      />
      <div className={cn(
        "absolute inset-0 transition-opacity duration-1000 ease-out",
        isHovered ? "bg-black/60" : "bg-black/80"
      )} />
      
      <div className="absolute inset-0 p-8 flex flex-col justify-end">
        <h3 className="text-2xl md:text-3xl font-heading text-white drop-shadow-md">{title}</h3>
        <p className={cn(
          "mt-2 text-white/80 max-w-2xl transform transition-all duration-1000 ease-[cubic-bezier(0.2,0.8,0.2,1)] origin-bottom",
          isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          {subtitle}
        </p>
      </div>
    </div>
  )
}
