"use client"

import { useAudienceMode } from "@/components/audience-mode-provider"
import { Button } from "@/components/ui/button"
import { FlaskConical, Moon, Scale, Sun, Home, Info, BarChart3, LayoutGrid, FileText } from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function Navigation() {
  const { theme, setTheme } = useTheme()
  const { mode, setMode } = useAudienceMode()
  const pathname = usePathname()

  const navItems = [
    {
      href: "/",
      label: "Home",
      icon: Home,
      isActive: pathname === "/"
    },
    {
      href: "/models",
      label: "Models",
      icon: LayoutGrid,
      isActive:
        pathname === "/models" ||
        pathname?.startsWith("/models/") ||
        pathname?.startsWith("/developers/")
    },
    {
      href: "/evals",
      label: "Evaluations",
      icon: BarChart3,
      isActive: pathname === "/evals" || pathname?.startsWith("/evals/")
    },
    {
      href: "/survey",
      label: "Survey",
      icon: FileText,
      isActive: pathname === "/survey" || pathname?.startsWith("/survey/")
    },
    {
      href: "/about",
      label: "About",
      icon: Info,
      isActive: pathname === "/about"
    }
  ]

  return (
    <header className="motion-academic-enter-soft border-b bg-card">
      <div className="container mx-auto px-4 py-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex-shrink-0">
              <img 
                src="https://evalevalai.com/assets/img/logo-square.png" 
                alt="EvalEval Logo" 
                className="motion-academic-button h-8 w-8 rounded-md hover:opacity-80 transition-opacity"
              />
            </Link>

            <Link href="/" className="motion-academic-button flex items-center gap-2 font-bold text-lg tracking-tight hover:text-primary/80 transition-colors">
              <span>Eval Cards</span>
              <span className="rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                Beta
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={item.isActive ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "motion-academic-button gap-2",
                      item.isActive && "bg-primary text-primary-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Button>
                </Link>
              ))}
            </nav>

            <div className="h-6 w-px bg-border" />

            <div className="inline-flex rounded-full border bg-muted/20 p-1">
              <button
                type="button"
                onClick={() => setMode("research")}
                className={cn(
                  "motion-academic-button inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                  mode === "research"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FlaskConical className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Research</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("policy")}
                className={cn(
                  "motion-academic-button inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                  mode === "policy"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Scale className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Policy</span>
              </button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="motion-academic-button h-9 w-9 p-0"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
