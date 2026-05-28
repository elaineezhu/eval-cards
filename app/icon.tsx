import { ImageResponse } from "next/og"

/**
 * Generated favicon. Renders a tiny "EC" mark on the accent-blue
 * brand colour so browsers have something to show in the tab strip,
 * bookmarks, and OS task switchers without shipping a separate binary
 * favicon.ico. Sized to the 32×32 favicon slot.
 */
export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1F8FCC",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "-0.04em",
          borderRadius: 4,
        }}
      >
        EC
      </div>
    ),
    { ...size },
  )
}
