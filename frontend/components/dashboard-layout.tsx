"use client"

import { Sidebar } from "./sidebar"
import { TopNav } from "./top-nav"

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="pl-64">
        <TopNav />
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
