import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Evaluation Cards — a reporting layer over evaluation infrastructure"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#faf9f6",
          color: "#1a1916",
          fontFamily: "Inter, sans-serif",
          padding: "72px",
        }}
      >
        {/* Brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              background: "#5bacd1",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "monospace",
              fontWeight: 600,
              fontSize: "22px",
              letterSpacing: "0.02em",
              borderRadius: "4px",
            }}
          >
            EE
          </div>
          <div
            style={{
              fontSize: "26px",
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Evaluation Cards
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "14px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#9c9a95",
              paddingLeft: "20px",
              marginLeft: "8px",
              borderLeft: "1px solid #e8e6e1",
              display: "flex",
              alignItems: "center",
              height: "32px",
            }}
          >
            Beta · EvalEval
          </div>
        </div>

        {/* Headline + lede */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "26px",
            flex: 1,
            justifyContent: "center",
            paddingTop: "8px",
          }}
        >
          <div
            style={{
              fontSize: "76px",
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
              fontWeight: 700,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex" }}>
              <span>A reporting&nbsp;</span>
              <span style={{ fontStyle: "italic", color: "#5bacd1" }}>layer</span>
              <span>&nbsp;over</span>
            </div>
            <div>evaluation infrastructure.</div>
          </div>
          <div
            style={{
              fontSize: "24px",
              lineHeight: 1.5,
              color: "#5c5a55",
              maxWidth: "920px",
            }}
          >
            A registry of reported model–benchmark results, organised under a five-level
            rollout hierarchy and four interpretive signals.
          </div>
        </div>

        {/* Footer strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "26px",
            borderTop: "1px solid #1a1916",
            fontFamily: "monospace",
            fontSize: "15px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#5c5a55",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ color: "#1a1916", fontWeight: 600 }}>Reproducibility</span>
            <span style={{ color: "#9c9a95" }}>·</span>
            <span style={{ color: "#1a1916", fontWeight: 600 }}>Completeness</span>
            <span style={{ color: "#9c9a95" }}>·</span>
            <span style={{ color: "#1a1916", fontWeight: 600 }}>Provenance</span>
            <span style={{ color: "#9c9a95" }}>·</span>
            <span style={{ color: "#1a1916", fontWeight: 600 }}>Comparability</span>
          </div>
          <div style={{ color: "#9c9a95" }}>evalcards.evalevalai.com</div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  )
}
