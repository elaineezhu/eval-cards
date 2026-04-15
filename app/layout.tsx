import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { AudienceModeProvider } from "@/components/audience-mode-provider"
import { BackendRefreshListener } from "@/components/backend-refresh-listener"
import { ThemeProvider } from "@/components/theme-provider"

export const metadata: Metadata = {
  title: "Eval Cards",
  description: "Professional AI system evaluation and assessment tool",
  generator: "v0.app",
  icons: {
    icon: "https://evalevalai.com/assets/img/logo-square.png",
    shortcut: "https://evalevalai.com/assets/img/logo-square.png",
    apple: "https://evalevalai.com/assets/img/logo-square.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AudienceModeProvider>
            <BackendRefreshListener />
            {children}
          </AudienceModeProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
