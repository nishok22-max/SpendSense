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
import { useAuth } from "@/components/auth-provider"
import { Database, Palette, Trash2, User, Bell } from "lucide-react"

const settingsSections = [
  { id: "profile",    label: "Profile",     icon: User },
  { id: "appearance", label: "Appearance",  icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data",       label: "Data",        icon: Database },
]

const themes = ["Dark", "Light", "System"] as const
const accentColors = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"] as const

interface ApiUser { id: number; name: string; email: string }

function SettingsContent() {
  const [activeSection, setActiveSection] = useState("profile")
  const { setTheme, theme } = useTheme()
  const { settings, updateSettings, isLoaded } = useSettings()
  const { logout } = useAuth()

  const [apiUser, setApiUser] = useState<ApiUser | null>(null)
  const [profileForm, setProfileForm] = useState({ name: "", email: "" })
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try { return JSON.parse(localStorage.getItem("notifications_enabled") ?? "true") } catch { return true }
  })
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchApiJson<ApiUser>("/api/auth/me")
      .then((u) => { setApiUser(u); setProfileForm({ name: u.name, email: u.email }) })
      .catch(() => {
        try {
          const raw = localStorage.getItem("user")
          if (raw) { const u = JSON.parse(raw) as ApiUser; setApiUser(u); setProfileForm({ name: u.name, email: u.email }) }
        } catch {}
      })
  }, [])

  const handleProfileSave = () => {
    if (apiUser) {
      const updated = { ...apiUser, name: profileForm.name, email: profileForm.email }
      localStorage.setItem("user", JSON.stringify(updated))
      setApiUser(updated)
      window.dispatchEvent(new Event("userUpdated"))
    }
    toast.success("Profile changes saved")
  }

  const handleToggleNotifications = (val: boolean) => {
    setNotificationsEnabled(val)
    localStorage.setItem("notifications_enabled", JSON.stringify(val))
    toast.success(val ? "Notifications enabled" : "Notifications disabled")
  }

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "This will permanently delete your account and ALL transaction data. This cannot be undone.\n\nType 'DELETE' to confirm."
    )
    if (!confirmed) return
    const typed = window.prompt("Type DELETE to confirm account deletion:")
    if (typed !== "DELETE") { toast.error("Deletion cancelled — text did not match."); return }

    setDeleting(true)
    try {
      await fetchApiJson("/api/auth/delete-account", { method: "DELETE" })
      toast.success("Account deleted. Goodbye!")
      logout()
    } catch (e: any) {
      toast.error(e.message || "Failed to delete account")
    } finally {
      setDeleting(false)
    }
  }

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  const currentThemeLabel = theme === "system" ? "System" : theme === "light" ? "Light" : "Dark"

  if (!isLoaded) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Loading...</div></DashboardLayout>

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Manage your account preferences</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          <div className="space-y-1">
            {settingsSections.map((s) => {
              const Icon = s.icon
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    activeSection === s.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />{s.label}
                </button>
              )
            })}
          </div>

          <div className="lg:col-span-3">
            {/* Profile */}
            {activeSection === "profile" && (
              <div className="rounded-xl border border-border bg-card p-6 space-y-6">
                <h3 className="text-lg font-semibold text-card-foreground">Profile Settings</h3>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                    <span className="text-xl font-bold text-primary">
                      {profileForm.name ? getInitials(profileForm.name) : "?"}
                    </span>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-card-foreground">Name</label>
                    <Input value={profileForm.name} onChange={(e) => setProfileForm(p => ({ ...p, name: e.target.value }))} className="bg-input" placeholder="Your name" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-card-foreground">Email</label>
                    <Input type="email" value={profileForm.email} onChange={(e) => setProfileForm(p => ({ ...p, email: e.target.value }))} className="bg-input" placeholder="your@email.com" />
                  </div>
                </div>
                <Button onClick={handleProfileSave}>Save Changes</Button>
              </div>
            )}

            {/* Appearance */}
            {activeSection === "appearance" && (
              <div className="rounded-xl border border-border bg-card p-6 space-y-6">
                <h3 className="text-lg font-semibold text-card-foreground">Appearance</h3>
                <div>
                  <h4 className="mb-3 font-medium text-card-foreground">Theme</h4>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {themes.map((t) => (
                      <button key={t} onClick={() => { setTheme(t.toLowerCase()); toast.success(`Theme set to ${t}`) }}
                        className={cn("rounded-lg border p-4 text-center transition-all", currentThemeLabel === t ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}>
                        <span className="text-sm font-medium text-card-foreground">{t}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="mb-3 font-medium text-card-foreground">Accent Color</h4>
                  <div className="flex gap-3">
                    {accentColors.map((color) => (
                      <button key={color} onClick={() => { updateSettings(p => ({ ...p, appearance: { ...p.appearance, accentColor: color } })); toast.success("Accent updated") }}
                        className={cn("h-8 w-8 rounded-full transition-transform hover:scale-110", color, color === settings.appearance.accentColor && "ring-2 ring-white ring-offset-2 ring-offset-card")} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Notifications */}
            {activeSection === "notifications" && (
              <div className="rounded-xl border border-border bg-card p-6 space-y-6">
                <h3 className="text-lg font-semibold text-card-foreground">Notifications</h3>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
                  <div>
                    <p className="font-medium text-card-foreground">In-App Notifications</p>
                    <p className="text-sm text-muted-foreground">Budget alerts and spending warnings</p>
                  </div>
                  <button
                    onClick={() => handleToggleNotifications(!notificationsEnabled)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      notificationsEnabled ? "bg-primary" : "bg-secondary"
                    )}
                    aria-label="Toggle notifications"
                  >
                    <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", notificationsEnabled ? "translate-x-6" : "translate-x-1")} />
                  </button>
                </div>
              </div>
            )}

            {/* Data */}
            {activeSection === "data" && (
              <div className="rounded-xl border border-border bg-card p-6 space-y-6">
                <h3 className="text-lg font-semibold text-card-foreground">Data Management</h3>
                <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex items-center gap-3">
                    <Trash2 className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="font-medium text-card-foreground">Delete Account</p>
                      <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </Button>
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
  return <Suspense><SettingsContent /></Suspense>
}
