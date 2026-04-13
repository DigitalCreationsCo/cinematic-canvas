"use client"

import Link from "next/link"
import { useEffect } from "react";
import "./globals.css";
import { CustomCursor } from "#/components/custom-cursor";

export default function Home() {
  useEffect(() => {
    const animateCounter = (el: Element, target: number) => {
      let start: number = 0;
      const dur = 1800;
      const step = (timestamp: number) => {
        if (!start) start = timestamp;
        const p = Math.min((timestamp - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const current = Math.floor(eased * target);
        const spans = el.querySelectorAll('span');
        let suf = '';
        spans.forEach(s => suf += s.outerHTML);
        el.innerHTML = (current >= 1000 ? (current / 1000).toFixed(current % 1000 === 0 ? 0 : 0) + 'K' : current) + suf;
        if (p < 1) requestAnimationFrame(step);
        else el.innerHTML = (target >= 1000 ? (target / 1000) + 'K' : target) + suf;
      };
      requestAnimationFrame(step);
    }

    const statObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const el = e.target;
          const target = parseInt((el as HTMLElement).dataset.target || '0');
          animateCounter(el, target);
          statObserver.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-target]').forEach(el => statObserver.observe(el));

    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classNameList.add('visible');
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(el => observer.observe(el));

    document.querySelectorAll('.sprocket-strip').forEach(strip => {
      const count = Math.ceil(window.innerHeight / 26);
      strip.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const h = document.createElement('div');
        h.className = 'sprocket-hole';
        strip.appendChild(h);
      }
    });

    const handleScroll = () => {
      const scrolled = window.scrollY;
      const hero = document.getElementById('hero');
      if (hero && scrolled < window.innerHeight) {
        hero.style.transform = `translateY(${scrolled * 0.3}px)`;
      }
    };
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    }
  }, []);

  return (
    <main className="editor-root relative w-full pt-[var(--nav-height)]">
      <CustomCursor />

      <section id="hero">
        <div className="hero-bg"></div>
        <div className="hero-grain"></div>
        <div className="hero-lines"></div>

        <div className="sprocket-strip left"></div>
        <div className="sprocket-strip right"></div>

        <p className="hero-eyebrow">The AI Storytelling Workspace</p>

        <h1 className="hero-title">
          Where <em>stories</em><br />
          become <span className="outline-text">worlds</span>
        </h1>

        <p className="hero-subtitle">
          A generative filmmaking workspace for directors, screenwriters, and authors. From first concept to final frame — powered by AI.
        </p>

        <div className="hero-actions">
          <Link href="/docs" className="btn-primary">Begin Your Story</Link>
          <Link href="#features" className="btn-ghost">Explore Features</Link>
        </div>

        <div className="hero-scroll-indicator">
          <span>Scroll</span>
          <div className="scroll-line"></div>
        </div>
      </section>

      <div className="ticker-section">
        <div className="ticker-track">
          <span className="ticker-item"><span className="dot"></span> AI Scene Generation</span>
          <span className="ticker-item"><span className="dot"></span> Character Arcs</span>
          <span className="ticker-item"><span className="dot"></span> Visual Storyboards</span>
          <span className="ticker-item"><span className="dot"></span> Script Formatting</span>
          <span className="ticker-item"><span className="dot"></span> Dialogue Engine</span>
          <span className="ticker-item"><span className="dot"></span> World-Building Tools</span>
          <span className="ticker-item"><span className="dot"></span> Shot Lists</span>
          <span className="ticker-item"><span className="dot"></span> Mood Boards</span>
          <span className="ticker-item"><span className="dot"></span> Lore Keeper</span>
          <span className="ticker-item"><span className="dot"></span> Screenplay Export</span>
          <span className="ticker-item"><span className="dot"></span> Collaboration</span>
          <span className="ticker-item"><span className="dot"></span> Timeline Editor</span>
          <span className="ticker-item"><span className="dot"></span> AI Scene Generation</span>
          <span className="ticker-item"><span className="dot"></span> Character Arcs</span>
          <span className="ticker-item"><span className="dot"></span> Visual Storyboards</span>
          <span className="ticker-item"><span className="dot"></span> Script Formatting</span>
          <span className="ticker-item"><span className="dot"></span> Dialogue Engine</span>
          <span className="ticker-item"><span className="dot"></span> World-Building Tools</span>
          <span className="ticker-item"><span className="dot"></span> Shot Lists</span>
          <span className="ticker-item"><span className="dot"></span> Mood Boards</span>
          <span className="ticker-item"><span className="dot"></span> Lore Keeper</span>
          <span className="ticker-item"><span className="dot"></span> Screenplay Export</span>
          <span className="ticker-item"><span className="dot"></span> Collaboration</span>
          <span className="ticker-item"><span className="dot"></span> Timeline Editor</span>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-grid">
          <div className="stat-item reveal">
            <div className="stat-num" data-target="14000">0</div>
            <div className="stat-label">Stories in production on Cinematic Canvas</div>
          </div>
          <div className="stat-item reveal reveal-delay-1">
            <div className="stat-num" data-target="98">0<span style={{ fontSize: "1.5rem" }}>%</span></div>
            <div className="stat-label">Creator satisfaction score</div>
          </div>
          <div className="stat-item reveal reveal-delay-2">
            <div className="stat-num" data-target="4">0<span style={{ fontSize: "1.5rem" }}>×</span></div>
            <div className="stat-label">Faster production compared to traditional tools</div>
          </div>
          <div className="stat-item reveal reveal-delay-3">
            <div className="stat-num" data-target="60">0<span style={{ fontSize: "1.5rem" }}>+</span></div>
            <div className="stat-label">Industry awards won by projects made here</div>
          </div>
        </div>
      </div>

      <section id="features" className="feature-showcase">
        <p className="section-label reveal">Core Capabilities</p>
        <h2 className="section-title reveal">Every tool the<br /><em>story demands</em></h2>

        <div className="scroll-features">
          <div className="scroll-feature-item reveal">
            <p className="feature-num">01</p>
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" /><path d="M10 8L16 12L10 16V8Z" /></svg>
            </div>
            <h3 className="feature-card-title">Scene Intelligence</h3>
            <p className="feature-card-desc">Generate rich scene descriptions, action lines, and subtext from a single prompt. The AI understands cinematic language, pacing, and genre conventions.</p>
            <span className="feature-card-tag">AI-Powered</span>
          </div>

          <div className="scroll-feature-item reveal reveal-delay-1">
            <p className="feature-num">02</p>
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3" /><path d="M20 21a8 8 0 1 0-16 0" /><circle cx="18" cy="18" r="4" /><path d="M18 16v4M16 18h4" /></svg>
            </div>
            <h3 className="feature-card-title">Character Engine</h3>
            <p className="feature-card-desc">Build psychologically deep characters with backstory generators, voice profiling, relationship mapping, and arc consistency across your entire narrative.</p>
            <span className="feature-card-tag">Deep Lore</span>
          </div>

          <div className="scroll-feature-item reveal reveal-delay-2">
            <p className="feature-num">03</p>
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
            </div>
            <h3 className="feature-card-title">Visual Storyboard</h3>
            <p className="feature-card-desc">Auto-generate shot-by-shot storyboard frames from your screenplay. Adjust camera angles, lighting mood, and composition with natural language.</p>
            <span className="feature-card-tag">Generative</span>
          </div>

          <div className="scroll-feature-item reveal reveal-delay-3">
            <p className="feature-num">04</p>
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
            </div>
            <h3 className="feature-card-title">World Builder</h3>
            <p className="feature-card-desc">Construct cohesive fictional universes with persistent lore, geography, history, culture, and rules. Never contradict yourself across episodes or volumes.</p>
            <span className="feature-card-tag">Persistent Memory</span>
          </div>

          <div className="scroll-feature-item reveal">
            <p className="feature-num">05</p>
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </div>
            <h3 className="feature-card-title">Dialogue Studio</h3>
            <p className="feature-card-desc">Write character-authentic dialogue that sounds like your characters, not an AI. The dialogue engine stays in voice across every scene and every draft.</p>
            <span className="feature-card-tag">Voice-Trained</span>
          </div>

          <div className="scroll-feature-item reveal reveal-delay-1">
            <p className="feature-num">06</p>
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            </div>
            <h3 className="feature-card-title">Script Exporter</h3>
            <p className="feature-card-desc">Export industry-standard screenplays in Final Draft, Fountain, PDF, and more. Automatic formatting for feature films, TV pilots, short films, and stage plays.</p>
            <span className="feature-card-tag">Industry Standard</span>
          </div>
        </div>
      </section>

      <section className="demo-section">
        <div className="demo-section-inner">
          <div className="demo-header">
            <div>
              <p className="section-label reveal">The Workspace</p>
              <h2 className="section-title reveal" style={{ marginBottom: "0" }}>Built for<br /><em>the way you create</em></h2>
            </div>
            <Link href="/docs" className="btn-ghost reveal">Try the Demo</Link>
          </div>

          <div className="workspace-preview reveal">
            <div className="workspace-titlebar">
              <div className="ws-dot"></div><div className="ws-dot"></div><div className="ws-dot"></div>
              <span className="ws-title">Cinematic Canvas — Neon Requiem · Act II</span>
            </div>
            <div className="workspace-body h-[520px]">
              <div className="ws-sidebar">
                <div className="ws-sidebar-label">Scenes</div>
                <div className="ws-scene-item">
                  <div className="ws-scene-thumb"></div>
                  <span className="ws-scene-label">INT. Precinct — Night</span>
                </div>
                <div className="ws-scene-item active">
                  <div className="ws-scene-thumb"></div>
                  <span className="ws-scene-label">EXT. Rooftop — Dusk</span>
                </div>
                <div className="ws-scene-item">
                  <div className="ws-scene-thumb"></div>
                  <span className="ws-scene-label">INT. Safehouse — Dawn</span>
                </div>
                <div className="ws-scene-item">
                  <div className="ws-scene-thumb"></div>
                  <span className="ws-scene-label">EXT. Harbor — Rain</span>
                </div>
                <div className="ws-sidebar-label">Characters</div>
                <div className="ws-scene-item">
                  <div className="ws-char-avatar" style={{ width: "28px", height: "18px", borderRadius: "2px" }}>M</div>
                  <span className="ws-scene-label">MAYA (Protagonist)</span>
                </div>
                <div className="ws-scene-item">
                  <div className="ws-char-avatar" style={{ width: "28px", height: "18px", borderRadius: "2px" }}>E</div>
                  <span className="ws-scene-label">ECHO (Antagonist)</span>
                </div>
              </div>

              <div className="ws-main">
                <div className="ws-canvas-area">
                  <div className="ws-canvas-bg"></div>
                  <div className="ws-beam"></div>
                  <div className="ws-frame">
                    <div className="ws-frame-content">
                      <div className="ws-frame-figure">
                        <div className="ws-silhouette"></div>
                      </div>
                      <div className="ws-scene-overlay-text">
                        <p className="ws-scene-location">EXT. ROOFTOP — DUSK — SCENE 14</p>
                        <p className="ws-scene-dialogue">"The city remembers everyone it swallows."</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="ws-timeline">
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span className="ws-timeline-label">VISUAL</span>
                    <div className="ws-timeline-track" style={{ flex: "1", position: "relative", height: "16px" }}>
                      <div className="ws-clip" style={{ left: "0%", width: "18%", background: "rgba(139,32,32,0.35)", border: "1px solid rgba(139,32,32,0.5)" }}><span>Ext. Establish</span></div>
                      <div className="ws-clip" style={{ left: "19%", width: "32%", background: "rgba(26,58,92,0.35)", border: "1px solid rgba(26,58,92,0.5)" }}><span>Rooftop Chase</span></div>
                      <div className="ws-clip" style={{ left: "52%", width: "28%", background: "rgba(201,165,90,0.2)", border: "1px solid rgba(201,165,90,0.4)" }}><span>Confrontation</span></div>
                      <div className="ws-clip" style={{ left: "81%", width: "18%", background: "rgba(139,32,32,0.35)", border: "1px solid rgba(139,32,32,0.5)" }}><span>Cutaway</span></div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span className="ws-timeline-label">AUDIO</span>
                    <div className="ws-timeline-track" style={{ flex: "1", position: "relative", height: "16px" }}>
                      <div className="ws-clip" style={{ left: "0%", width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}><span>Ambient City / Score Layer</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ws-panel">
                <div className="ws-panel-section">
                  <div className="ws-panel-title">AI Co-writer</div>
                  <div className="ws-ai-prompt">
                    <div className="prompt-label">▸ Scene Prompt</div>
                    Maya confronts Echo on the rooftop. Tension, subtext about betrayal, cinematic.
                  </div>
                  <div className="ws-ai-output" style={{ marginTop: "8px" }}>
                    Maya steps onto the gravel. Echo doesn't turn around. Below them, the city hums its indifference.<br /><br />
                    <strong style={{ color: "var(--color-warm)" }}>MAYA</strong><br />
                    You knew the whole time.<br /><br />
                    Echo exhales smoke.<span className="cursor-blink"></span>
                  </div>
                </div>
                <div className="ws-panel-section">
                  <div className="ws-panel-title">Characters Present</div>
                  <div className="ws-char-item">
                    <div className="ws-char-avatar">M</div>
                    <div className="ws-char-info">
                      <div className="ws-char-name">Maya Chen</div>
                      <div className="ws-char-role">Detective · Protagonist</div>
                      <div className="ws-emotion-bar"><div className="ws-emotion-fill" style={{ width: "72%" }}></div></div>
                    </div>
                  </div>
                  <div className="ws-char-item">
                    <div className="ws-char-avatar">E</div>
                    <div className="ws-char-info">
                      <div className="ws-char-name">Echo</div>
                      <div className="ws-char-role">Informant · Antagonist</div>
                      <div className="ws-emotion-bar"><div className="ws-emotion-fill" style={{ width: "44%", background: "var(--color-accent-red)" }}></div></div>
                    </div>
                  </div>
                </div>
                <div className="ws-panel-section">
                  <div className="ws-panel-title">Scene Notes</div>
                  <div className="ws-ai-output" style={{ fontSize: ".65rem", lineHeight: "1.7" }}>
                    ◆ Key revelation scene<br />
                    ◆ Echo's motivation hidden until Act III<br />
                    ◆ Pay off rain motif from Act I
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="workflow-section">
        <div className="workflow-inner">
          <p className="section-label reveal">How It Works</p>
          <h2 className="section-title reveal">From <em>idea</em> to final cut,<br />in one workspace</h2>
          <div className="workflow-steps">
            <div className="workflow-step reveal">
              <div className="step-circle">
                <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              </div>
              <h4 className="step-title">Concept</h4>
              <p className="step-desc">Drop your seed idea. The AI helps you develop premise, genre, tone, and theme.</p>
            </div>
            <div className="workflow-step reveal reveal-delay-1">
              <div className="step-circle">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
              </div>
              <h4 className="step-title">Structure</h4>
              <p className="step-desc">Build your three-act framework, sequences, and beat sheet with intelligent scaffolding.</p>
            </div>
            <div className="workflow-step reveal reveal-delay-2">
              <div className="step-circle">
                <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </div>
              <h4 className="step-title">Characters</h4>
              <p className="step-desc">Build your cast with deep psychological profiles, voices, and relational dynamics.</p>
            </div>
            <div className="workflow-step reveal reveal-delay-3">
              <div className="step-circle">
                <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
              </div>
              <h4 className="step-title">Write</h4>
              <p className="step-desc">Draft scenes, dialogue, and action lines with your AI co-writer always available.</p>
            </div>
            <div className="workflow-step reveal reveal-delay-4">
              <div className="step-circle">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              </div>
              <h4 className="step-title">Export</h4>
              <p className="step-desc">Output industry-standard formats: Final Draft, Fountain, PDF, or shoot-ready storyboards.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="testimonials-section">
        <div className="testimonials-header">
          <p className="section-label reveal" style={{ justifyContent: "center" }}>Creator Stories</p>
          <h2 className="section-title reveal" style={{ margin: "0 auto", textAlign: "center" }}>What storytellers say</h2>
        </div>

        <div className="testimonial-track-wrap" style={{ marginBottom: "20px" }}>
          <div className="testimonial-track">
            <div className="testimonial-card">
              <div className="star-row"><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span></div>
              <p className="testimonial-quote">"Cinematic Canvas turned a vague idea into a 110-page screenplay in three weeks. The character engine is unlike anything I've used before."</p>
              <div className="testimonial-author">
                <div className="testimonial-avatar">SL</div>
                <div><div className="testimonial-name">Sofia Liang</div><div className="testimonial-role">Screenwriter · Sundance Alumna</div></div>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="star-row"><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span></div>
              <p className="testimonial-quote">"This is the first tool that actually understands the difference between a screenplay and a novel. It writes like a filmmaker, not a text generator."</p>
              <div className="testimonial-author">
                <div className="testimonial-avatar">DM</div>
                <div><div className="testimonial-name">Damian Moreau</div><div className="testimonial-role">Director · Cannes Selected</div></div>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="star-row"><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span></div>
              <p className="testimonial-quote">"My fantasy novel series has 400 characters and 12 kingdoms. The World Builder keeps every detail consistent. It's a miracle tool."</p>
              <div className="testimonial-author">
                <div className="testimonial-avatar">RV</div>
                <div><div className="testimonial-name">Renata Voss</div><div className="testimonial-role">Fantasy Author · NYT Bestseller</div></div>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="star-row"><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span></div>
              <p className="testimonial-quote">"I used to dread storyboarding. Now I generate 40 frames from a scene description in minutes. My pitches have never looked better."</p>
              <div className="testimonial-author">
                <div className="testimonial-avatar">KO</div>
                <div><div className="testimonial-name">Kofi Owusu</div><div className="testimonial-role">Commercial Director</div></div>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="star-row"><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span></div>
              <p className="testimonial-quote">"The AI co-writer doesn't replace my voice — it amplifies it. Every suggestion feels like it came from someone who's read everything I've ever written."</p>
              <div className="testimonial-author">
                <div className="testimonial-avatar">AP</div>
                <div><div className="testimonial-name">Amara Patel</div><div className="testimonial-role">TV Showrunner</div></div>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="star-row"><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span></div>
              <p className="testimonial-quote">"Cinematic Canvas turned a vague idea into a 110-page screenplay in three weeks. The character engine is unlike anything I've used before."</p>
              <div className="testimonial-author">
                <div className="testimonial-avatar">SL</div>
                <div><div className="testimonial-name">Sofia Liang</div><div className="testimonial-role">Screenwriter · Sundance Alumna</div></div>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="star-row"><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span><span className="star">★</span></div>
              <p className="testimonial-quote">"This is the first tool that actually understands the difference between a screenplay and a novel. It writes like a filmmaker, not a text generator."</p>
              <div className="testimonial-author">
                <div className="testimonial-avatar">DM</div>
                <div><div className="testimonial-name">Damian Moreau</div><div className="testimonial-role">Director · Cannes Selected</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="compare-section">
        <p className="section-label reveal">Why Cinematic Canvas</p>
        <h2 className="section-title reveal">Built for storytellers,<br />not <em>spreadsheets</em></h2>

        <div className="compare-table reveal">
          <div className="compare-header">
            <span className="compare-col-label">Feature</span>
            <span className="compare-col-label highlight">Cinematic Canvas</span>
            <span className="compare-col-label">Generic AI Writers</span>
            <span className="compare-col-label">Traditional Software</span>
          </div>
          <div className="compare-row"><span className="compare-feature">Screenplay-native formatting</span><span className="compare-cell"><span className="check">✦</span></span><span className="compare-cell"><span className="cross">✕</span></span><span className="compare-cell"><span className="check">✦</span></span></div>
          <div className="compare-row"><span className="compare-feature">Persistent character memory</span><span className="compare-cell"><span className="check">✦</span></span><span className="compare-cell"><span className="cross">✕</span></span><span className="compare-cell"><span className="cross">✕</span></span></div>
          <div className="compare-row"><span className="compare-feature">AI scene generation</span><span className="compare-cell"><span className="check">✦</span></span><span className="compare-cell"><span className="check">✦</span></span><span className="compare-cell"><span className="cross">✕</span></span></div>
          <div className="compare-row"><span className="compare-feature">Visual storyboard generator</span><span className="compare-cell"><span className="check">✦</span></span><span className="compare-cell"><span className="cross">✕</span></span><span className="compare-cell"><span className="cross">✕</span></span></div>
          <div className="compare-row"><span className="compare-feature">World-building lore keeper</span><span className="compare-cell"><span className="check">✦</span></span><span className="compare-cell"><span className="cross">✕</span></span><span className="compare-cell"><span className="cross">✕</span></span></div>
          <div className="compare-row"><span className="compare-feature">Industry export formats</span><span className="compare-cell"><span className="check">✦</span></span><span className="compare-cell"><span className="cross">✕</span></span><span className="compare-cell"><span className="check">✦</span></span></div>
          <div className="compare-row"><span className="compare-feature">Voice-trained dialogue</span><span className="compare-cell"><span className="check">✦</span></span><span className="compare-cell"><span className="cross">✕</span></span><span className="compare-cell"><span className="cross">✕</span></span></div>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <p className="section-label reveal" style={{ justifyContent: "center" }}>Pricing</p>
        <h2 className="section-title reveal" style={{ margin: "0 auto", textAlign: "center" }}>Start with your <em>story</em></h2>
        <div className="pricing-grid">
          <div className="pricing-card reveal">
            <h3 className="pricing-tier">Storyteller</h3>
            <div className="pricing-price"><span className="amount">$0</span><span className="period">forever</span></div>
            <p className="pricing-desc">For writers exploring what AI-assisted storytelling can do.</p>
            <ul className="pricing-features">
              <li>3 active projects</li>
              <li>50 AI scene generations/mo</li>
              <li>Basic character profiles</li>
              <li>Script PDF export</li>
            </ul>
            <Link href="#" className="pricing-cta outline">Start Free</Link>
          </div>
          <div className="pricing-card featured reveal reveal-delay-1">
            <span className="pricing-badge">Most Popular</span>
            <h3 className="pricing-tier">Creator</h3>
            <div className="pricing-price"><span className="amount">$29</span><span className="period">/month</span></div>
            <p className="pricing-desc">For serious storytellers building full-length projects.</p>
            <ul className="pricing-features">
              <li>Unlimited projects</li>
              <li>Unlimited AI generations</li>
              <li>Deep character engine</li>
              <li>Visual storyboard generator</li>
              <li>World builder & lore keeper</li>
              <li>All export formats</li>
            </ul>
            <Link href="#" className="pricing-cta filled">Start Creating</Link>
          </div>
          <div className="pricing-card reveal reveal-delay-2">
            <h3 className="pricing-tier">Studio</h3>
            <div className="pricing-price"><span className="amount">$89</span><span className="period">/month</span></div>
            <p className="pricing-desc">For production companies and writing teams at scale.</p>
            <ul className="pricing-features">
              <li>Everything in Creator</li>
              <li>Team collaboration</li>
              <li>Custom style training</li>
              <li>Priority AI generation</li>
              <li>Dedicated support</li>
              <li>API access</li>
            </ul>
            <Link href="#" className="pricing-cta outline">Contact Sales</Link>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-bg"></div>
        <p className="section-label reveal" style={{ justifyContent: "center" }}>Your Story Awaits</p>
        <h2 className="cta-title reveal">The <em>canvas</em> is<br />already yours</h2>
        <p className="hero-subtitle reveal" style={{ margin: "24px auto 44px", maxWidth: "500px", textAlign: "center" }}>Join 14,000 storytellers who've already started. No credit card required.</p>
        <div className="hero-actions" style={{ justifyContent: "center" }}>
          <Link href="/docs" className="btn-primary">Begin Free Today</Link>
          <Link href="#features" className="btn-ghost">See All Features</Link>
        </div>
      </section>
    </main>
  );
}
