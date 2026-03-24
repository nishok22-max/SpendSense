"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Upload,
  Brain,
  PieChart,
  Lightbulb,
  Settings,
  Sparkles,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Upload Transactions", href: "/upload", icon: Upload },
  { name: "AI Categorization", href: "/categorization", icon: Brain },
  { name: "Spending Analytics", href: "/analytics", icon: PieChart },
  { name: "Insights", href: "/insights", icon: Lightbulb },
  { name: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-sidebar-foreground">
          AI EXPENSE ANALYSER
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 transition-colors",
                  isActive
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                )}
              />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Bottom user card */}
      <SidebarUser />
    </aside>
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function SidebarUser() {
  const [user, setUser] = React.useState<{ name: string; email: string } | null>(null)

  React.useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem("user")
        if (raw) setUser(JSON.parse(raw))
      } catch {
        // ignore
      }
    }

    load()

    // React to profile saves in the same tab via a custom event
    window.addEventListener("userUpdated", load)
    // React to changes from other tabs via storage event
    window.addEventListener("storage", load)

    return () => {
      window.removeEventListener("userUpdated", load)
      window.removeEventListener("storage", load)
    }
  }, [])

  return (
    <div className="border-t border-sidebar-border p-4">
      <div className="rounded-lg bg-sidebar-accent/50 p-3">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <span className="text-sm font-medium text-primary">
                {getInitials(user.name)}
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/60">
                {user.email}
              </p>
            </div>
          </div>
        ) : (
          <div className="h-9" />
        )}
      </div>
    </div>
  )
}
