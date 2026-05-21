import { useState } from "react";

const plans = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    credits: "10 credits / day",
    badge: null,
    highlight: false,
    cta: "Get started",
    ctaStyle: "outline",
    description: "Try Higgsfield with no commitment.",
    features: [
      "10 credits per day",
      "Selected models only",
      "Watermark on outputs",
      "1 parallel generation",
      "Community support",
    ],
    notIncluded: [
      "Veo 3 / Kling 3.0 access",
      "365-day unlimited gens",
      "Soul V2 free generations",
      "Priority processing",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 15,
    annualPrice: 15,
    credits: "200 credits / mo",
    badge: null,
    highlight: false,
    cta: "Get started",
    ctaStyle: "outline",
    description: "For creators just getting started with AI video.",
    features: [
      "200 credits per month",
      "Selected models only",
      "2 parallel video generations",
      "4 parallel image generations",
      "720p output",
      "Email support",
    ],
    notIncluded: [
      "Veo 3 / Kling 3.0 access",
      "365-day unlimited gens",
      "Soul V2 free generations",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    monthlyPrice: 49,
    annualPrice: 39,
    credits: "1,000 credits / mo",
    badge: null,
    highlight: false,
    cta: "Get started",
    ctaStyle: "outline",
    description: "For consistent creators who need all models.",
    features: [
      "1,000 credits per month",
      "All models unlocked",
      "Veo 3 & Kling 3.0 access",
      "6 parallel video generations",
      "8 parallel image generations",
      "365-day unlimited image models",
      "5,000 free Soul V2 & Cinema gens",
      "Priority support",
    ],
    notIncluded: ["365-day unlimited video model", "4K Seedream 4.5 unlimited"],
  },
  {
    id: "ultra",
    name: "Ultra",
    monthlyPrice: 129,
    annualPrice: 99,
    credits: "3,000 – 9,000 credits / mo",
    badge: "Most popular",
    highlight: true,
    cta: "Get started",
    ctaStyle: "primary",
    description: "For high-volume creators building AI projects at scale.",
    features: [
      "3,000 credits / mo (scales to 9,000)",
      "All models unlocked",
      "Veo 3, Kling 3.0, Sora 2 access",
      "8 parallel video generations",
      "8 parallel image generations",
      "365-day unlimited video model (choose 1)",
      "365-day unlimited image models",
      "4K Seedream 4.5 unlimited",
      "10,000 free Soul V2 & Cinema gens",
      "50–60% cheaper credits vs lower tiers",
      "Priority support",
    ],
    notIncluded: [],
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 89,
    annualPrice: 62,
    priceNote: "per seat / mo",
    credits: "1,500 credits / seat",
    badge: null,
    highlight: false,
    cta: "Contact sales",
    ctaStyle: "outline",
    description: "For agencies and teams producing AI video at scale.",
    features: [
      "1,500 credits / seat (shared pool)",
      "2–15 seats",
      "All models unlocked",
      "16 parallel video generations",
      "16 parallel image generations",
      "Shared workspace & integrated chat",
      "Usage analytics dashboard",
      "Shareable Soul IDs & elements",
      "Custom SSO access",
      "Dedicated account manager",
    ],
    notIncluded: [],
  },
];

const faqItems = [
  {
    q: "Do credits roll over each month?",
    a: "No. Monthly plan credits reset at each billing cycle. Unused credits are forfeited and do not carry over to the next month.",
  },
  {
    q: "What counts as an 'unlimited' generation?",
    a: "Unlimited generations on Plus and Ultra apply to specific image and video models listed in your plan. Usage may be subject to dynamic speed adjustments during high-traffic periods.",
  },
  {
    q: "Can I upgrade or downgrade mid-cycle?",
    a: "Upgrades take effect immediately. Downgrades take effect at the start of your next billing cycle. You keep your current plan's features until renewal.",
  },
  {
    q: "What is the refund policy?",
    a: "Refunds are available within 7 days of your initial purchase, provided zero credits have been used. A service fee of up to 6% may apply. Renewals are non-refundable.",
  },
  {
    q: "Which plan includes Veo 3?",
    a: "Veo 3 and Veo 3 Fast are available on the Plus plan and above. The Starter plan provides access to selected models only and does not include Veo 3.",
  },
  {
    q: "Can I purchase extra credits?",
    a: "Yes. Top-up credit packs are available at approximately $5 per 100 credits. Top-up credits expire after 90 days.",
  },
];

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0, marginTop: 1 }}
    >
      <circle cx="8" cy="8" r="8" fill="rgba(255,255,255,0.08)" />
      <path
        d="M4.5 8L7 10.5L11.5 6"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0, marginTop: 1 }}
    >
      <circle cx="8" cy="8" r="8" fill="rgba(255,255,255,0.04)" />
      <path
        d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
        flexShrink: 0,
      }}
    >
      <path
        d="M4.5 6.75L9 11.25L13.5 6.75"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HiggsFieldPricing() {
  const [annual, setAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [ultraCredits, setUltraCredits] = useState(3000);

  const getPrice = (plan: (typeof plans)[0]) => {
    if (plan.id === "ultra" && annual) {
      const baseAnnual = 99;
      const extraCreditsPerK = 10;
      const extraK = Math.round((ultraCredits - 3000) / 1000);
      return baseAnnual + extraK * extraCreditsPerK;
    }
    return annual ? plan.annualPrice : plan.monthlyPrice;
  };

  const getDiscount = (plan: (typeof plans)[0]) => {
    if (
      !annual ||
      plan.monthlyPrice === 0 ||
      plan.monthlyPrice === plan.annualPrice
    )
      return null;
    const pct = Math.round(
      ((plan.monthlyPrice - plan.annualPrice) / plan.monthlyPrice) * 100,
    );
    return pct > 0 ? `${pct}% off` : null;
  };

  return (
    <div
      style={{
        backgroundColor: "#0f1113",
        minHeight: "100vh",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#fff",
        padding: "0 0 80px",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          position: "sticky",
          top: 0,
          backgroundColor: "#0f1113",
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect
              width="22"
              height="22"
              rx="5"
              fill="white"
              fillOpacity="0.9"
            />
            <path
              d="M6 16V6l5 5 5-5v10"
              stroke="#0f1113"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.02em" }}
          >
            Higgsfield
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 28,
            fontSize: 14,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          {["Explore", "Supercomputer", "Cinema Studio", "AI Influencer"].map(
            (item) => (
              <span key={item} style={{ cursor: "pointer" }}>
                {item}
              </span>
            ),
          )}
        </div>
        <button
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            background: "#fff",
            color: "#0f1113",
            fontWeight: 600,
            fontSize: 14,
            border: "none",
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "64px 24px 48px" }}>
        <div
          style={{
            display: "inline-block",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
            marginBottom: 20,
          }}
        >
          Pricing
        </div>
        <h1
          style={{
            fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            margin: "0 0 16px",
            lineHeight: 1.1,
          }}
        >
          Choose your plan
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "rgba(255,255,255,0.5)",
            margin: "0 auto 40px",
            maxWidth: 480,
            lineHeight: 1.6,
          }}
        >
          Generate AI videos, animations, and ads with unlimited access to
          powerful AI video tools.
        </p>

        {/* Toggle */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 999,
            padding: "4px 6px",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <button
            onClick={() => setAnnual(false)}
            style={{
              padding: "7px 18px",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              background: !annual ? "rgba(255,255,255,0.12)" : "transparent",
              color: !annual ? "#fff" : "rgba(255,255,255,0.45)",
              transition: "all 0.2s",
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            style={{
              padding: "7px 18px",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              background: annual ? "rgba(255,255,255,0.12)" : "transparent",
              color: annual ? "#fff" : "rgba(255,255,255,0.45)",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Annual
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(255,200,50,0.15)",
                color: "#ffc832",
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid rgba(255,200,50,0.25)",
                letterSpacing: "0.03em",
              }}
            >
              UP TO 30% OFF
            </span>
          </button>
        </div>
      </div>

      {/* Plan Cards */}
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 24px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {plans.map((plan) => {
          const price = getPrice(plan);
          const discount = getDiscount(plan);
          const isUltra = plan.id === "ultra";
          const isBusiness = plan.id === "business";

          return (
            <div
              key={plan.id}
              style={{
                borderRadius: 16,
                border: plan.highlight
                  ? "1px solid rgba(255,255,255,0.22)"
                  : "1px solid rgba(255,255,255,0.07)",
                background: plan.highlight
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(255,255,255,0.02)",
                padding: "24px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 0,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Subtle top gradient for popular */}
              {plan.highlight && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                  }}
                />
              )}

              {/* Badge */}
              <div style={{ minHeight: 28, marginBottom: 12 }}>
                {plan.badge && (
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      background: "rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.85)",
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    {plan.badge}
                  </span>
                )}
              </div>

              {/* Plan name */}
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  marginBottom: 6,
                }}
              >
                {plan.name}
              </div>

              {/* Description */}
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.45)",
                  marginBottom: 24,
                  lineHeight: 1.5,
                  minHeight: 40,
                }}
              >
                {plan.description}
              </div>

              {/* Price */}
              <div style={{ marginBottom: 8 }}>
                {plan.id === "business" ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 38,
                        fontWeight: 700,
                        letterSpacing: "-0.04em",
                        lineHeight: 1,
                      }}
                    >
                      ${price}
                    </span>
                    <span
                      style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}
                    >
                      / seat / mo
                    </span>
                  </div>
                ) : price === 0 ? (
                  <span
                    style={{
                      fontSize: 38,
                      fontWeight: 700,
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                    }}
                  >
                    Free
                  </span>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 38,
                        fontWeight: 700,
                        letterSpacing: "-0.04em",
                        lineHeight: 1,
                      }}
                    >
                      ${price}
                    </span>
                    <span
                      style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}
                    >
                      / mo
                    </span>
                  </div>
                )}
              </div>

              {/* Annual note */}
              <div style={{ minHeight: 20, marginBottom: 16 }}>
                {annual &&
                plan.monthlyPrice > 0 &&
                plan.monthlyPrice !== plan.annualPrice ? (
                  <span
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.35)",
                    }}
                  >
                    Billed annually · ${plan.annualPrice * 12}/yr
                    {discount && (
                      <span
                        style={{
                          marginLeft: 6,
                          color: "#ffc832",
                          fontWeight: 600,
                        }}
                      >
                        {discount}
                      </span>
                    )}
                  </span>
                ) : annual &&
                  plan.monthlyPrice === plan.annualPrice &&
                  plan.monthlyPrice > 0 ? (
                  <span
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}
                  >
                    Same price billed annually
                  </span>
                ) : null}
              </div>

              {/* Ultra slider */}
              {isUltra && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    marginBottom: 18,
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}
                    >
                      Credits / month
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#fff",
                      }}
                    >
                      {ultraCredits.toLocaleString()}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3000}
                    max={9000}
                    step={1000}
                    value={ultraCredits}
                    onChange={(e) => setUltraCredits(Number(e.target.value))}
                    style={{
                      width: "100%",
                      accentColor: "#fff",
                      cursor: "pointer",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "rgba(255,255,255,0.25)",
                      marginTop: 4,
                    }}
                  >
                    <span>3K</span>
                    <span>9K</span>
                  </div>
                </div>
              )}

              {/* Credits pill */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 999,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.6)",
                  marginBottom: 20,
                  width: "fit-content",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle
                    cx="6.5"
                    cy="6.5"
                    r="5.5"
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M6.5 3.5V6.5L8.5 8"
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                {isUltra
                  ? `${ultraCredits.toLocaleString()} credits / mo`
                  : plan.credits}
              </div>

              {/* CTA */}
              <button
                style={{
                  padding: "11px 16px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  border:
                    plan.ctaStyle === "primary"
                      ? "none"
                      : "1px solid rgba(255,255,255,0.14)",
                  background:
                    plan.ctaStyle === "primary"
                      ? "#fff"
                      : "rgba(255,255,255,0.05)",
                  color: plan.ctaStyle === "primary" ? "#0f1113" : "#fff",
                  marginBottom: 24,
                  letterSpacing: "-0.01em",
                  transition: "all 0.15s",
                }}
              >
                {plan.cta}
              </button>

              {/* Divider */}
              <div
                style={{
                  height: 1,
                  background: "rgba(255,255,255,0.06)",
                  marginBottom: 20,
                }}
              />

              {/* Features */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {plan.features.map((f) => (
                  <div
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <CheckIcon />
                    <span
                      style={{
                        fontSize: 13,
                        color: "rgba(255,255,255,0.7)",
                        lineHeight: 1.5,
                      }}
                    >
                      {f}
                    </span>
                  </div>
                ))}
                {plan.notIncluded.map((f) => (
                  <div
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <XIcon />
                    <span
                      style={{
                        fontSize: 13,
                        color: "rgba(255,255,255,0.22)",
                        lineHeight: 1.5,
                      }}
                    >
                      {f}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Enterprise Banner */}
      <div
        style={{
          maxWidth: 1280,
          margin: "16px auto 0",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(255,255,255,0.02)",
            padding: "28px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: 6,
              }}
            >
              Enterprise
            </div>
            <div
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.45)",
                maxWidth: 480,
              }}
            >
              Dedicated capacity, volume discounts, SOC 2 compliance, custom
              contracts, and a dedicated success team for large organizations.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {["Dedicated compute", "Custom SLA", "SSO & SAML", "SOC 2"].map(
                (tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.5)",
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 999,
                      padding: "5px 12px",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {tag}
                  </span>
                ),
              )}
            </div>
            <button
              style={{
                padding: "10px 22px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                whiteSpace: "nowrap",
              }}
            >
              Contact sales →
            </button>
          </div>
        </div>
      </div>

      {/* Models Section */}
      <div
        style={{
          maxWidth: 1280,
          margin: "72px auto 0",
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.35)",
            marginBottom: 16,
          }}
        >
          Powered by 15+ AI models
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "center",
            maxWidth: 860,
            margin: "0 auto",
          }}
        >
          {[
            "Sora 2",
            "Veo 3.1",
            "Kling 3.0",
            "WAN 2.6",
            "Seedance 2.0",
            "Hailuo 02",
            "Nano Banana 2",
            "Seedream 5.0",
            "Flux.2 Pro",
            "GPT Image",
            "Soul V2",
            "Cinema",
            "Speak 2.0",
            "Kling O1",
            "Seedream 4.5",
          ].map((model) => (
            <span
              key={model}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "rgba(255,255,255,0.45)",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8,
                padding: "6px 14px",
              }}
            >
              {model}
            </span>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div
        style={{
          maxWidth: 700,
          margin: "32px auto 0",
          padding: "0 24px",
          textAlign: "center",
          fontSize: 12,
          color: "rgba(255,255,255,0.25)",
          lineHeight: 1.7,
        }}
      >
        Unlimited usage may be subject to dynamic speed adjustments during
        high-traffic periods. Credits must be used within the active
        subscription lifecycle and are non-transferable.
      </div>

      {/* FAQ */}
      <div
        style={{
          maxWidth: 720,
          margin: "80px auto 0",
          padding: "0 24px",
        }}
      >
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            textAlign: "center",
            marginBottom: 36,
          }}
        >
          Frequently asked questions
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {faqItems.map((item, i) => (
            <div
              key={i}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "18px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  background:
                    openFaq === i
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(255,255,255,0.02)",
                  border: "none",
                  cursor: "pointer",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 500,
                  transition: "background 0.2s",
                }}
              >
                <span>{item.q}</span>
                <ChevronIcon open={openFaq === i} />
              </button>
              {openFaq === i && (
                <div
                  style={{
                    padding: "0 20px 18px",
                    fontSize: 14,
                    color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.65,
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          textAlign: "center",
          marginTop: 80,
          padding: "32px 24px 0",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          fontSize: 13,
          color: "rgba(255,255,255,0.25)",
        }}
      >
        © 2026 Higgsfield AI™. All rights reserved. ·{" "}
        <span style={{ cursor: "pointer" }}>Privacy</span> ·{" "}
        <span style={{ cursor: "pointer" }}>Terms</span> ·{" "}
        <span style={{ cursor: "pointer" }}>Cookie Notice</span>
      </div>
    </div>
  );
}
