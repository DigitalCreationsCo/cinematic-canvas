"use client"

import Link from "next/link"
import { useState } from "react";
import clsx from "clsx"



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
      <main className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col content-gap">
        
        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center text-center min-h-[calc(100vh-120px)] space-y-8">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-heading drop-shadow-xl">
            Conjure the <br className="hidden md:block" />
            <span className="text-primary opacity-90 drop-shadow-2xl">Impossible.</span>
          </h1>
          <p className="md:text-xl text-muted-foreground max-w-2xl font-light leading-relaxed">
            Build worlds with intelligence. Control your story.
          </p>
          <div className="flex flex-col md:flex-row gap-4 inline-gap pt-8">
            <Link
              href="/examples"
              className="w-full inline-flex h-16 items-center justify-center rounded-sm glass-brick px-10 text-sm font-medium uppercase tracking-widest text-foreground shadow-sm transition-all hover:bg-white/10 btn-cinematic duration-100"
            >
              <span className="btn-text-go-cinematic">Explore Gallery</span>
            </Link>
            <Link
              href="/docs"
              className="w-full h-16 inline-flex items-center justify-center rounded-sm bg-primary px-10 text-sm font-medium uppercase tracking-widest text-primary-foreground shadow-lg transition-all hover:bg-white hover:text-black btn-cinematic border-gradient duration-100"
            >
              <span className="btn-text-go-cinematic">Read Docs</span>
            </Link>
          </div>
        </section>

        {/* Core Feature Section */}
        <section className="py-24 text-center space-y-6">
          <h2 className="text-3xl md:text-[3.5rem] font-heading tracking-tight">
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
              <h3 className="text-2xl font-normal tracking-tight">For Lone Visionaries</h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                Direct your entire film from a single interface. From storyboarding to final render, you have an intelligent crew at your fingertips ready to materialize your vision without the overhead of a massive production team.
              </p>
            </div>
            <div className="cinematic-card p-12 space-y-4">
              <h3 className="text-2xl font-normal tracking-tight">For Production Teams</h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                Unify your creative pipeline. Share assets, establish canonical visual styles, and let the continuity engine maintain coherence across multiple artists and parallel rendering workloads.
              </p>
            </div>
          </div>
        </section>

        {/* Case Studies Section */ }
        <section className="py-24 space-y-12">
          <div className="text-center">
            <h2 className="text-3xl md:text-[3.5rem] font-heading tracking-tight">Tales of the Canvas</h2>
            <p className="mt-4 text-muted-foreground">Real stories from the generative frontier. (COMING SOON)</p>
          </div>
          
          <CaseStudiesRow />
        </section>


        {/* CTA Section */}
        <section className="py-64 text-center flex flex-col items-center space-y-8">
          <h2 className="text-4xl md:text-6xl font-heading ">
            Your story awaits.
          </h2>
          <Link
            href="/docs" 
            className="inline-flex h-16 items-center justify-center rounded-sm bg-primary px-12 text-sm font-medium uppercase tracking-widest text-primary-foreground shadow-2xl transition-all hover:bg-white hover:text-black btn-cinematic border-gradient duration-100"
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

function CaseStudiesRow() {
  const [ activeId, setActiveId ] = useState<number | null>(null);

  const caseStudies = [
    {
      id: 1,
      title: "Tailoring the Beat: Music Videos in 48 Hours",
      subtitle: "How a solo director delivered a complex, stylized music video for an indie band using generative continuity.",
      image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=2000&auto=format&fit=crop"
    },
    {
      id: 2,
      title: "Producing the Unseen: An AI Feature Film",
      subtitle: "A small team used Cinematic Canvas to maintain consistent character appearances and complex environmental lighting across a 90-minute film.",
      image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2000&auto=format&fit=crop"
    }
  ];

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[800px] md:h-[500px] w-full bg-black p-2 md:p-4 rounded-xl">
      { caseStudies.map((study) => (
        <CaseStudy
          key={ study.id }
          { ...study }
          isActive={ activeId === study.id }
          // Restore close-on-click functionality
          onClick={ () => setActiveId(activeId === study.id ? null : study.id) }
        />
      )) }
    </div>
  );
}

function CaseStudy({ title, subtitle, image, isActive, onClick }: any) {
  return (
    <div
      onClick={ onClick }
      className={ clsx(
        "relative overflow-hidden rounded-lg cursor-pointer h-full transition-[flex] duration-500 ease-[cubic-bezier(0.05,0.7,0.1,1.0)]",
        isActive ? "flex-[4]" : "flex-[1]"
      ) }
    >
      {/* Cinematic Background: Very slow zoom */ }
      <div
        className={ clsx(
          "absolute inset-0 bg-cover bg-center transition-transform duration-[4000ms] ease-out",
          isActive ? "scale-110" : "scale-100"
        ) }
        style={ { backgroundImage: `url(${image})` } }
      />

      {/* Scrim Overlay */ }
      <div className={ clsx(
        "absolute inset-0 transition-opacity duration-500",
        isActive ? "bg-black/50" : "bg-black/70 hover:bg-black/60"
      ) } />

      <div className="absolute inset-0 p-8 flex flex-col justify-end">
        <h3 className={ clsx(
          "text-2xl md:text-3xl font-normal text-white transition-transform duration-500 ease-[cubic-bezier(0.05,0.7,0.1,1.0)]",
          !isActive && "translate-y-2 text-balance"
        ) }>
          { title }
        </h3>

        <div className={ clsx(
          "overflow-hidden transition-all duration-300",
          isActive ? "opacity-100 max-h-40 mt-4" : "opacity-0 max-h-0 mt-0"
        ) }>
          <p className="text-white/80 max-w-xl text-lg leading-relaxed">
            { subtitle }
          </p>
        </div>
      </div>
    </div>
  );
}