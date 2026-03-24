"use client"

import { Suspense, useState, useEffect } from "react"
import { toast } from "sonner"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
import { useSettings } from "@/hooks/use-settings"
import { fetchApiJson } from "@/lib/api"
import {
  Database,
  Download,
  Palette,
  Trash2,
  User,
} from "lucide-react"

const settingsSections = [
  { id: "profile", label: "Profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data", label: "Data Management", icon: Database },
]

const themes = ["Dark", "Light", "System"] as const
const accentColors = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
] as const

interface ApiUser {
  id: number
  name: string
  email: string
}

function SettingsContent() {
  const [activeSection, setActiveSection] = useState("profile")
  const { setTheme, theme } = useTheme()
  const { settings, updateSettings, isLoaded } = useSettings()

  // Real user from backend
  const [apiUser, setApiUser] = useState<ApiUser | null>(null)
  const [profileForm, setProfileForm] = useState({ name: "", email: "" })

  // Load the real user from /api/auth/me on mount
  useEffect(() => {
    fetchApiJson<ApiUser>("/api/auth/me")
      .then((user) => {
        setApiUser(user)
        setProfileForm({ name: user.name, email: user.email })
      })
      .catch(() => {
        // fallback: try localStorage user key saved at login
        try {
          const raw = localStorage.getItem("user")
          if (raw) {
            const u = JSON.parse(raw) as ApiUser
            setApiUser(u)
            setProfileForm({ name: u.name, email: u.email })
          }
        } catch {
          // ignore
        }
      })
  }, [])

  const handleAction = (msg: string) => {
    toast.success(`${msg} saved`)
  }

  const handleProfileSave = () => {
    if (apiUser) {
      const updated = { ...apiUser, name: profileForm.name, email: profileForm.email }
      localStorage.setItem("user", JSON.stringify(updated))
      setApiUser(updated)
      // Notify sidebar (and any other listeners) in the same tab
      window.dispatchEvent(new Event("userUpdated"))
    }
    handleAction("Profile changes")
  }

  const selectTheme = (nextTheme: (typeof themes)[number]) => {
    setTheme(nextTheme.toLowerCase())
    toast.success(`Theme set to ${nextTheme}`)
  }

  const selectAccent = (nextAccent: string) => {
    updateSettings((prev) => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        accentColor: nextAccent,
      },
    }))
    toast.success("Accent color updated")
  }

  const handleExportData = () => {
    const dataStr = JSON.stringify(settings, null, 2)
    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "ExpenseAI-Data.json"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("Data export initiated")
  }

  const handleDeleteAccount = () => {
    if (window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      localStorage.clear()
      toast.success("Account data cleared from local storage")
      window.location.reload()
    }
  }

  if (!isLoaded) return (
    <DashboardLayout>
      <div className="p-8 text-center text-muted-foreground">Loading settings...</div>
    </DashboardLayout>
  )

  // Avatar initials: from name (could be "First Last" or just "Username")
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  const currentThemeLabel =
    theme === "system" ? "System" :
    theme === "light" ? "Light" : "Dark"

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Manage your account preferences and application settings</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          <div className="space-y-1">
            {settingsSections.map((section) => {
              const Icon = section.icon
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {section.label}
                </button>
              )
            })}
          </div>

          <div className="lg:col-span-3">
            {/* ── Profile ── */}
            {activeSection === "profile" && (
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="mb-6 text-lg font-semibold text-card-foreground">Profile Settings</h3>
                <div className="space-y-6">
                  <div className="flex items-center gap-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
                      <span className="text-2xl font-bold text-primary">
                        {profileForm.name ? getInitials(profileForm.name) : "?"}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium text-card-foreground">Username</label>
                      <Input
                        value={profileForm.name}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="border-input bg-input text-foreground"
                        placeholder="Your name"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium text-card-foreground">Email Address</label>
                      <Input
                        type="email"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                        className="border-input bg-input text-foreground"
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>

                  <Button
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={handleProfileSave}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            )}


            {/* ── Appearance ── */}
            {activeSection === "appearance" && (
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="mb-6 text-lg font-semibold text-card-foreground">Appearance</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="mb-3 font-medium text-card-foreground">Theme</h4>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {themes.map((itemTheme) => (
                        <button
                          key={itemTheme}
                          onClick={() => selectTheme(itemTheme)}
                          className={cn(
                            "rounded-lg border p-4 text-center transition-all",
                            currentThemeLabel === itemTheme
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <span className="text-sm font-medium text-card-foreground">{itemTheme}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-3 font-medium text-card-foreground">Accent Color</h4>
                    <div className="flex gap-3">
                      {accentColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => selectAccent(color)}
                          className={cn(
                            "h-8 w-8 rounded-full transition-transform hover:scale-110",
                            color,
                            color === settings.appearance.accentColor && "ring-2 ring-white ring-offset-2 ring-offset-card"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Data Management ── */}
            {activeSection === "data" && (
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="mb-6 text-lg font-semibold text-card-foreground">Data Management</h3>
                <div className="space-y-6">
                  <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
                    <div className="flex items-center gap-3">
                      <Download className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-card-foreground">Export Data</p>
                        <p className="text-sm text-muted-foreground">Download all your transactions and insights</p>
                      </div>
                    </div>
                    <Button variant="outline" className="border-border" onClick={handleExportData}>Export</Button>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <div className="flex items-center gap-3">
                      <Trash2 className="h-5 w-5 text-destructive" />
                      <div>
                        <p className="font-medium text-card-foreground">Delete Account</p>
                        <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
                      </div>
                    </div>
                    <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={handleDeleteAccount}>Delete</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}
