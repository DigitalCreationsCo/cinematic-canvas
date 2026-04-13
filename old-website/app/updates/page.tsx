"use client"

import Link from "next/link"
import { useEffect } from "react";
import "../globals.css";
import { CustomCursor } from "#/components/custom-cursor";

export default function Updates() {
  useEffect(() => {
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classNameList.add('visible');
        }
      });
    }, { threshold: 0.1 });
    reveals.forEach(el => observer.observe(el));

    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', function (this: HTMLElement) {
        filterBtns.forEach(b => b.classNameList.remove('active'));
        this.classNameList.add('active');
      });
    });
  }, []);

  return (
    <main className="editor-root relative w-full">
      <CustomCursor />

      <div className="page-header">
        <div>
          <p className="page-eyebrow">Product Updates</p>
          <h1 className="page-title">What's <em>new</em><br />on the canvas</h1>
        </div>
        <div>
          <p className="page-meta">Latest Release</p>
          <p className="page-desc">Every update, enhancement, and new capability we ship — documented as we build the future of AI storytelling. Subscribe to never miss a release.</p>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <Link href="#" style={{ fontFamily: "var(--font-mono)", fontSize: ".7rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-gold)", textDecoration: "none", display: "flex", alignItems: "center", gap: "6px", border: "1px solid rgba(201,165,90,0.3)", padding: "8px 14px", borderRadius: "2px", transition: "all .2s" }}>
              RSS Feed
            </Link>
            <Link href="#" style={{ fontFamily: "var(--font-mono)", fontSize: ".7rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-muted-warm)", textDecoration: "none", display: "flex", alignItems: "center", gap: "6px", border: "1px solid var(--color-border-subtle)", padding: "8px 14px", borderRadius: "2px", transition: "all .2s" }}>
              Changelog
            </Link>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <button className="filter-btn active">All Updates</button>
        <button className="filter-btn">Features</button>
        <button className="filter-btn">AI Improvements</button>
        <button className="filter-btn">Performance</button>
        <button className="filter-btn">Exports</button>
        <button className="filter-btn">Collaboration</button>
        <button className="filter-btn">Bug Fixes</button>
      </div>

      <div className="updates-main">
        <Link className="hero-update reveal" href="#">
          <div className="hero-update-cover">
            <div className="cover-cinematic cover-1">
              <div className="cover-orb animate-orb" style={{ width: "300px", height: "300px", background: "radial-gradient(circle,rgba(139,32,32,0.6),transparent)", top: "-50px", left: "-80px" }}></div>
              <div className="cover-orb animate-orb" style={{ width: "200px", height: "200px", background: "radial-gradient(circle,rgba(201,165,90,0.25),transparent)", bottom: "20px", right: "40px", animationDelay: "2s" }}></div>
              <div className="cover-grid-lines"></div>
              <div className="scan-line animate-scan"></div>
              <div className="cover-ui">
                <div className="cover-screenshot animate-ss-float">
                  <div className="ss-bar" style={{ background: "rgba(201,165,90,0.4)", width: "40%" }}></div>
                  <div className="ss-row">
                    <div className="ss-block" style={{ background: "rgba(255,255,255,0.04)", maxWidth: "60px" }}></div>
                    <div className="ss-block" style={{ background: "rgba(201,165,90,0.12)" }}></div>
                  </div>
                  <div className="ss-line" style={{ background: "rgba(255,255,255,0.06)", width: "80%" }}></div>
                  <div className="ss-line" style={{ background: "rgba(255,255,255,0.04)", width: "60%" }}></div>
                  <div className="ss-line" style={{ background: "rgba(201,165,90,0.15)", width: "70%" }}></div>
                  <div className="ss-row" style={{ marginTop: "8px" }}>
                    <div className="ss-block" style={{ background: "rgba(255,255,255,0.03)", height: "36px" }}></div>
                    <div className="ss-block" style={{ background: "rgba(139,32,32,0.2)", height: "36px" }}></div>
                    <div className="ss-block" style={{ background: "rgba(255,255,255,0.03)", height: "36px" }}></div>
                  </div>
                </div>
              </div>
              <div className="cover-grain"></div>
            </div>
            <span className="cover-badge">Latest Release</span>
            <span className="cover-version">v2.4.0</span>
          </div>
          <div className="hero-update-body">
            <div>
              <p className="update-category">Major Release · AI Features</p>
              <h2 className="update-title">Scene Intelligence 2.0 — The biggest AI upgrade in Cinematic Canvas history</h2>
              <p className="update-excerpt">Our most powerful scene generation model yet. Scene Intelligence 2.0 understands subtext, pacing, visual language, and genre convention at a level that makes every generated scene feel genuinely written — not assembled. Plus: multi-scene continuity, emotional arc tracking, and a new cinematic voice calibration tool.</p>
              <div className="update-meta">
                <span className="update-date">March 18, 2025</span>
                <div className="update-tags">
                  <span className="tag">AI</span>
                  <span className="tag">Scene Generation</span>
                  <span className="tag">Major</span>
                </div>
              </div>
            </div>
            <div className="read-more">Read Full Update</div>
          </div>
        </Link>

        <div className="updates-grid">
          <Link className="update-card wide reveal" href="#">
            <div className="card-cover">
              <div className="cover-cinematic cover-2" style={{ width: "100%", height: "100%", position: "relative" }}>
                <div className="cover-orb animate-orb" style={{ width: "400px", height: "200px", background: "radial-gradient(circle,rgba(201,165,90,0.18),transparent)", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animationDelay: "1s" }}></div>
                <div className="cover-grid-lines"></div>
                <div className="cover-ui">
                  <div style={{ display: "flex", gap: "12px", width: "70%" }}>
                    <div className="cover-screenshot" style={{ flex: "1" }}>
                      <div className="ss-bar" style={{ background: "rgba(201,165,90,0.3)", width: "55%", marginBottom: "8px" }}></div>
                      <div className="ss-line" style={{ background: "rgba(255,255,255,0.06)", width: "90%" }}></div>
                      <div className="ss-line" style={{ background: "rgba(255,255,255,0.04)", width: "70%" }}></div>
                      <div className="ss-line" style={{ background: "rgba(255,255,255,0.04)", width: "80%" }}></div>
                    </div>
                    <div className="cover-screenshot" style={{ flex: "1" }}>
                      <div className="ss-bar" style={{ background: "rgba(139,32,32,0.4)", width: "40%", marginBottom: "8px" }}></div>
                      <div className="ss-line" style={{ background: "rgba(255,255,255,0.06)", width: "85%" }}></div>
                      <div className="ss-line" style={{ background: "rgba(255,255,255,0.04)", width: "65%" }}></div>
                    </div>
                  </div>
                </div>
                <div className="cover-grain"></div>
                <span className="cover-badge">Feature</span>
              </div>
            </div>
            <div className="card-body">
              <p className="card-category">Collaboration · New Feature</p>
              <h3 className="card-title">Real-time co-writing — write your screenplay with your team, live</h3>
              <p className="card-excerpt">Multiplayer editing comes to Cinematic Canvas. See your collaborators' cursors, edits, and comments appear in real time — across scenes, characters, and the world builder. Role-based permissions mean you control who can write, suggest, or comment.</p>
              <div className="card-footer">
                <span className="card-date">Feb 28, 2025</span>
                <span className="card-arrow">→</span>
              </div>
            </div>
          </Link>

          <Link className="update-card reveal" href="#">
            <div className="card-cover">
              <div className="cover-cinematic cover-3" style={{ width: "100%", height: "100%", position: "relative" }}>
                <div className="cover-orb animate-orb" style={{ width: "180px", height: "180px", background: "radial-gradient(circle,rgba(26,58,92,0.8),transparent)", top: "10px", right: "10px" }}></div>
                <div className="cover-orb animate-orb" style={{ width: "120px", height: "120px", background: "radial-gradient(circle,rgba(201,165,90,0.3),transparent)", bottom: "20px", left: "20px", animationDelay: "1.5s" }}></div>
                <div className="cover-grid-lines"></div>
                <div className="cover-ui">
                  <div className="cover-screenshot" style={{ width: "65%" }}>
                    <div style={{ display: "flex", gap: "4px", marginBottom: "6px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "rgba(201,165,90,0.5)" }}></div>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.1)" }}></div>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.1)" }}></div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ height: "32px", background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.2)", borderRadius: "2px" }}></div>
                      <div style={{ height: "32px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "2px" }}></div>
                      <div style={{ height: "32px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "2px" }}></div>
                    </div>
                  </div>
                </div>
                <div className="cover-grain"></div>
                <span className="cover-badge">Character AI</span>
              </div>
            </div>
            <div className="card-body">
              <p className="card-category">Character Engine</p>
              <h3 className="card-title">Character Voice Profiles</h3>
              <p className="card-excerpt">Train the AI on each character's unique speech patterns, vocabulary, and subtext. Dialogue now stays distinctly in-character across every draft.</p>
              <div className="card-footer">
                <span className="card-date">Feb 14, 2025</span>
                <span className="card-arrow">→</span>
              </div>
            </div>
          </Link>

          <Link className="update-card reveal" href="#">
            <div className="card-cover">
              <div className="cover-cinematic cover-4" style={{ width: "100%", height: "100%", position: "relative" }}>
                <div className="cover-orb animate-orb" style={{ width: "220px", height: "220px", background: "radial-gradient(circle,rgba(90,154,122,0.35),transparent)", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}></div>
                <div className="cover-grid-lines"></div>
                <div className="cover-ui">
                  <div className="cover-screenshot" style={{ width: "68%" }}>
                    <div className="ss-bar" style={{ background: "rgba(90,154,122,0.4)", width: "50%", marginBottom: "8px" }}></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      <div style={{ height: "24px", background: "rgba(255,255,255,0.04)", borderRadius: "2px" }}></div>
                      <div style={{ height: "24px", background: "rgba(201,165,90,0.1)", borderRadius: "2px" }}></div>
                      <div style={{ height: "24px", background: "rgba(201,165,90,0.1)", borderRadius: "2px" }}></div>
                      <div style={{ height: "24px", background: "rgba(255,255,255,0.04)", borderRadius: "2px" }}></div>
                    </div>
                  </div>
                </div>
                <div className="cover-grain"></div>
                <span className="cover-badge">Export</span>
              </div>
            </div>
            <div className="card-body">
              <p className="card-category">Exports & Formats</p>
              <h3 className="card-title">Final Draft 12 + Fountain export</h3>
              <p className="card-excerpt">Industry-standard screenplay export completely rebuilt from scratch. Perfect margins, correct slug lines, and flawless transition formatting every time.</p>
              <div className="card-footer">
                <span className="card-date">Jan 30, 2025</span>
                <span className="card-arrow">→</span>
              </div>
            </div>
          </Link>

          <Link className="update-card reveal" href="#">
            <div className="card-cover">
              <div className="cover-cinematic cover-5" style={{ width: "100%", height: "100%", position: "relative" }}>
                <div className="cover-orb animate-orb" style={{ width: "200px", height: "200px", background: "radial-gradient(circle,rgba(139,32,32,0.5),transparent)", bottom: "-30px", right: "-30px" }}></div>
                <div className="cover-orb animate-orb" style={{ width: "150px", height: "150px", background: "radial-gradient(circle,rgba(201,165,90,0.2),transparent)", top: "20px", left: "30px", animationDelay: ".8s" }}></div>
                <div className="cover-grid-lines"></div>
                <div className="cover-ui">
                  <div className="cover-screenshot" style={{ width: "65%" }}>
                    <div style={{ height: "60px", background: "rgba(201,165,90,0.05)", border: "1px solid rgba(201,165,90,0.15)", borderRadius: "3px", marginBottom: "6px", padding: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--color-gold-dim)", border: "1px solid rgba(201,165,90,0.3)", flexShrink: "0" }}></div>
                      <div style={{ flex: "1" }}>
                        <div style={{ height: "4px", background: "rgba(201,165,90,0.3)", borderRadius: "2px", width: "70%", marginBottom: "4px" }}></div>
                        <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", width: "50%" }}></div>
                      </div>
                    </div>
                    <div className="ss-line" style={{ background: "rgba(255,255,255,0.05)", width: "100%" }}></div>
                    <div className="ss-line" style={{ background: "rgba(255,255,255,0.03)", width: "80%" }}></div>
                  </div>
                </div>
                <div className="cover-grain"></div>
                <span className="cover-badge">World Builder</span>
              </div>
            </div>
            <div className="card-body">
              <p className="card-category">World Building</p>
              <h3 className="card-title">Lore Keeper v3</h3>
              <p className="card-excerpt">The World Builder now automatically detects lore contradictions across your entire project and visualizes your story's timeline in a cinematic timeline view.</p>
              <div className="card-footer">
                <span className="card-date">Jan 15, 2025</span>
                <span className="card-arrow">→</span>
              </div>
            </div>
          </Link>

          <Link className="update-card reveal" href="#">
            <div className="card-cover">
              <div className="cover-cinematic cover-6" style={{ width: "100%", height: "100%", position: "relative" }}>
                <div className="cover-orb animate-orb" style={{ width: "250px", height: "250px", background: "radial-gradient(circle,rgba(90,122,170,0.4),transparent)", top: "50%", left: "50%", transform: "translate(-50%,-55%)" }}></div>
                <div className="cover-grid-lines"></div>
                <div className="cover-ui">
                  <div className="cover-screenshot" style={{ width: "68%" }}>
                    <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
                      <div style={{ flex: "1", height: "18px", background: "rgba(201,165,90,0.15)", borderRadius: "2px" }}></div>
                      <div style={{ flex: "2", height: "18px", background: "rgba(255,255,255,0.04)", borderRadius: "2px" }}></div>
                    </div>
                    <div style={{ height: "40px", background: "rgba(90,122,170,0.12)", border: "1px solid rgba(90,122,170,0.2)", borderRadius: "2px", marginBottom: "6px" }}></div>
                    <div className="ss-line" style={{ background: "rgba(255,255,255,0.05)", width: "90%" }}></div>
                    <div className="ss-line" style={{ background: "rgba(255,255,255,0.03)", width: "65%" }}></div>
                  </div>
                </div>
                <div className="cover-grain"></div>
                <span className="cover-badge">Performance</span>
              </div>
            </div>
            <div className="card-body">
              <p className="card-category">Performance</p>
              <h3 className="card-title">3× faster AI generation</h3>
              <p className="card-excerpt">Major infrastructure upgrade slashes AI generation times by up to 70%. Scene drafts, character suggestions, and dialogue completions are now near-instant.</p>
              <div className="card-footer">
                <span className="card-date">Jan 2, 2025</span>
                <span className="card-arrow">→</span>
              </div>
            </div>
          </Link>

        </div>

        <div className="signup-bar reveal">
          <div className="signup-bar-text">
            <h3 className="signup-bar-title">Get updates in your inbox</h3>
            <p className="signup-bar-sub">We ship fast. Never miss a release.</p>
          </div>
          <div className="signup-form">
            <input type="email" className="signup-input" placeholder="your@email.com" />
            <button className="signup-btn">Subscribe</button>
          </div>
        </div>

        <div className="changelog-section">
          <div className="changelog-header reveal">
            <h2 className="changelog-title">Full <em>Changelog</em></h2>
            <Link href="#" style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-gold)", textDecoration: "none" }}>View on GitHub →</Link>
          </div>

          <div className="changelog-entry reveal">
            <div className="changelog-date">Mar 18<br />2025</div>
            <div className="changelog-body">
              <div className="changelog-version">v2.4.0 — Scene Intelligence 2.0</div>
              <div className="changelog-sub">Major AI release · Scene generation, dialogue, continuity</div>
              <ul className="changelog-items">
                <li className="new">Scene Intelligence 2.0 model — complete rewrite with cinematic subtext understanding</li>
                <li className="new">Multi-scene continuity tracking across acts and sequences</li>
                <li className="new">Emotional arc meter — real-time character emotion tracking per scene</li>
                <li className="new">Cinematic voice calibration tool — tune AI output to match your style</li>
                <li className="imp">Dialogue generation 40% more naturalistic</li>
                <li className="fix">Fixed issue where character names would occasionally swap mid-scene</li>
                <li className="fix">Resolved memory leak in World Builder with large lore databases</li>
              </ul>
            </div>
          </div>

          <div className="changelog-entry reveal">
            <div className="changelog-date">Feb 28<br />2025</div>
            <div className="changelog-body">
              <div className="changelog-version">v2.3.0 — Multiplayer Co-writing</div>
              <div className="changelog-sub">Collaboration · Real-time editing</div>
              <ul className="changelog-items">
                <li className="new">Real-time multiplayer editing across all workspace panels</li>
                <li className="new">Role-based permissions (Writer, Editor, Viewer, Commenter)</li>
                <li className="new">Presence indicators and collaborative cursors</li>
                <li className="new">Comment threads on scenes, characters, and world entries</li>
                <li className="imp">Auto-save now syncs across all collaborators in real time</li>
                <li className="fix">Fixed formatting inconsistency in exported collaborative scripts</li>
              </ul>
            </div>
          </div>

          <div className="changelog-entry reveal">
            <div className="changelog-date">Jan 30<br />2025</div>
            <div className="changelog-body">
              <div className="changelog-version">v2.2.0 — Export Overhaul</div>
              <div className="changelog-sub">Exports · Industry formats</div>
              <ul className="changelog-items">
                <li className="new">Final Draft 12 (.fdx) export fully rebuilt</li>
                <li className="new">Fountain export with correct spec compliance</li>
                <li className="new">Stage play formatting template added</li>
                <li className="imp">PDF export now preserves all formatting and scene numbers</li>
                <li className="imp">Storyboard export adds frame numbers and camera notation</li>
                <li className="fix">Fixed dual dialogue formatting in exported scripts</li>
              </ul>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
