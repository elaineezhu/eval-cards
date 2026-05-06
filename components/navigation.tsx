"use client"

import { useEffect, useState } from "react"
import { useAudienceMode } from "@/components/audience-mode-provider"
import { Eye, Menu, Moon, Sun, X } from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { fetchBackendManifest } from "@/lib/dashboard-data-client"

function formatSnapshotDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function Navigation() {
  const { theme, setTheme } = useTheme()
  const { mode, setMode } = useAudienceMode()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = [
    {
      href: "/",
      label: "Overview",
      isActive: pathname === "/",
    },
    {
      href: "/models",
      label: "Models",
      isActive:
        pathname === "/models" ||
        pathname?.startsWith("/models/") ||
        pathname?.startsWith("/developers/"),
    },
    {
      href: "/evals",
      label: "Evaluations",
      isActive: pathname === "/evals" || pathname?.startsWith("/evals/"),
    },
    {
      href: "/about",
      label: "About",
      isActive: pathname === "/about",
    },
  ]

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <>
      <header className="ec-topbar motion-academic-enter-soft">
        <div className="ec-topbar-inner">
          <Link href="/" className="ec-brand">
            <img
              src="https://evalevalai.com/assets/img/logo-square.png"
              alt=""
              className="ec-brand-mark-img h-7 w-7 shrink-0"
              width={28}
              height={28}
            />
            <span>Eval Cards</span>
            <span className="ec-brand-sub hidden lg:inline">Beta · EvalEval</span>
          </Link>

          <nav className="ec-nav-links hidden lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(item.isActive && "active")}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 lg:ml-0">
            <div
              className="ec-mode-toggle hidden sm:inline-flex"
              title="Reader mode — same evidence, different rendering."
            >
              <span className="ec-mode-toggle-label" aria-label="Reader mode">
                <Eye className="h-3.5 w-3.5" />
              </span>
              <button
                type="button"
                className={mode === "policy" ? "on" : ""}
                onClick={() => setMode("policy")}
              >
                Policy
              </button>
              <button
                type="button"
                className={mode === "research" ? "on" : ""}
                onClick={() => setMode("research")}
              >
                Research
              </button>
            </div>

            <button
              type="button"
              className="ec-icon-btn"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              <Sun className="h-3.5 w-3.5 dark:hidden" />
              <Moon className="hidden h-3.5 w-3.5 dark:block" />
            </button>

            <button
              type="button"
              className="ec-icon-btn lg:hidden"
              onClick={() => setMobileOpen((current) => !current)}
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden border-t border-[color:var(--border-soft)] bg-[color:var(--bg)]">
            <div className="mx-auto w-full max-w-[96rem] px-4 py-3 sm:px-8">
              <nav className="grid gap-0.5">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "block px-2 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                      item.isActive
                        ? "text-[color:var(--fg)]"
                        : "text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="ec-mode-toggle mt-3 inline-flex w-full sm:hidden">
                <span className="ec-mode-toggle-label">
                  <Eye className="h-3.5 w-3.5" />
                </span>
                <button
                  type="button"
                  className={cn("flex-1", mode === "policy" && "on")}
                  onClick={() => setMode("policy")}
                >
                  Policy
                </button>
                <button
                  type="button"
                  className={cn("flex-1", mode === "research" && "on")}
                  onClick={() => setMode("research")}
                >
                  Research
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
      <ReaderModeBanner />
    </>
  )
}

function ReaderModeBanner() {
  const { mode } = useAudienceMode()
  const [snapshotLabel, setSnapshotLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchBackendManifest()
      .then((status) => {
        if (cancelled) return
        setSnapshotLabel(
          formatSnapshotDate(status?.currentManifest?.generated_at),
        )
      })
      .catch(() => {
        // Manifest fetch is best-effort — just hide the banner label.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={cn("mode-banner", `mode-${mode}`)}>
      <div className="mode-banner-inner">
        <span className="mode-banner-tag">
          {mode === "research" ? "Research mode" : "Policy mode"}
        </span>
        <span className="mode-banner-dot">·</span>
        <span className="mode-banner-text">
          {mode === "research"
            ? "Methodology and configuration foregrounded — specific missing fields, setup-variant differences, expanded metric configuration."
            : "Plain-language interpretation foregrounded — Policy Notes (what / caveat / intended for), accountability framings, compressed metric detail."}
        </span>
        <span className="mode-banner-spacer" />
        {snapshotLabel && (
          <span className="mode-banner-meta">Snapshot · {snapshotLabel}</span>
        )}
      </div>
    </div>
  )
}
