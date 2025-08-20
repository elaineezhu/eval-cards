"use client"

import { Button } from "@/components/ui/button"
import { Moon, Sun, Home, ArrowUpDown, Info } from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function Navigation() {
  const { theme, setTheme } = useTheme()
  const pathname = usePathname()

  const navItems = [
    {
      href: "/",
      label: "Home",
      icon: Home,
      isActive: pathname === "/"
    },
    {
      href: "/analytics",
      label: "Analytics",
      icon: ArrowUpDown,
      isActive: pathname === "/analytics"
    },
    {
      href: "/about",
      label: "About",
      icon: Info,
      isActive: pathname === "/about"
    }
  ]

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Logo and branding */}
          <div className="flex items-center gap-4">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <img 
                src="https://evalevalai.com/assets/img/logo-square.png" 
                alt="EvalEval Logo" 
                className="w-10 h-10 rounded-lg hover:scale-105 transition-transform"
              />
            </Link>
            
            {/* App title and description */}
            <div>
              <Link href="/" className="block group">
                <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground group-hover:text-primary transition-colors">
                  AI Eval Dashboard
                </h1>
              </Link>
              <p className="text-sm text-muted-foreground">
                AI evaluation documentation platform
              </p>
            </div>
          </div>

          {/* Navigation and actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Navigation links */}
            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={item.isActive ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "gap-2",
                      item.isActive && "bg-primary text-primary-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Button>
                </Link>
              ))}
            </nav>

            {/* Separator */}
            <div className="w-px h-6 bg-border" />

            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-9 w-9 p-0"
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
