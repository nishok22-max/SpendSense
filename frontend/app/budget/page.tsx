"use client"

import { Suspense, useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchApiJson } from "@/lib/api"
import { toast } from "sonner"
import { Target, TrendingUp, AlertTriangle, CheckCircle2, Loader2, PiggyBank } from "lucide-react"
import { cn } from "@/lib/utils"

const CATEGORIES = [
  "Food", "Transport", "Shopping", "Entertainment",
  "Health", "Bills & Utilities", "Education", "Travel",
  "Coffee", "Groceries", "Other"
]

interface BudgetItem {
  category: string
  budget: number
  actual: number
}

type AnalyticsResponse = {
  spendingByCategory: Array<{ name: string; value: number }>
  totalSpending: number
}

function BudgetContent() {
  const [budgets, setBudgets] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem("spendsense_budgets")
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })
  const [actual, setActual] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchApiJson<AnalyticsResponse>("/api/analytics?timeFilter=This%20month")
      .then((data) => {
        const map: Record<string, number> = {}
        data.spendingByCategory.forEach((item) => { map[item.name] = item.value })
        setActual(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = () => {
    setSaving(true)
    localStorage.setItem("spendsense_budgets", JSON.stringify(budgets))
    setTimeout(() => { setSaving(false); toast.success("Budgets saved!") }, 400)
  }

  const items: BudgetItem[] = CATEGORIES.map((cat) => ({
    category: cat,
    budget: Number(budgets[cat] || 0),
    actual: actual[cat] || 0,
  })).filter((i) => i.budget > 0 || i.actual > 0)

  const totalBudget = items.reduce((s, i) => s + i.budget, 0)
  const totalActual = items.reduce((s, i) => s + i.actual, 0)
  const overallPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0

  const getMessage = () => {
    if (totalBudget === 0) return null
    if (overallPct <= 90) return { type: "positive", text: "🎉 Great job! You're managing your budget well and staying under control." }
    if (overallPct <= 110) return { type: "warning", text: "📊 You're close to your budget limit. Stay mindful for the rest of the month!" }
    return { type: "danger", text: "⚠️ You've exceeded your budget. Consider reviewing your top spending categories." }
  }

  const message = getMessage()

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <PiggyBank className="h-7 w-7 text-primary" /> Budget vs Actual
          </h1>
          <p className="text-muted-foreground">Set monthly budgets and track how your actual spending compares</p>
        </div>

        {/* Overall Summary Card */}
        {totalBudget > 0 && (
          <div className={cn(
            "rounded-xl border p-5",
            overallPct <= 90 ? "border-emerald-500/30 bg-emerald-500/10" :
            overallPct <= 110 ? "border-amber-500/30 bg-amber-500/10" :
            "border-destructive/30 bg-destructive/10"
          )}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Budget</p>
                <p className="text-3xl font-bold text-foreground">₹{totalBudget.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className={cn("text-3xl font-bold", overallPct > 100 ? "text-destructive" : "text-emerald-400")}>
                  ₹{totalActual.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Usage</p>
                <p className={cn("text-3xl font-bold", overallPct > 100 ? "text-destructive" : overallPct > 90 ? "text-amber-400" : "text-emerald-400")}>
                  {overallPct.toFixed(0)}%
                </p>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-background/40 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", overallPct > 100 ? "bg-destructive" : overallPct > 90 ? "bg-amber-500" : "bg-emerald-500")}
                style={{ width: `${Math.min(overallPct, 100)}%` }}
              />
            </div>
            {message && (
              <p className={cn("mt-3 text-sm font-medium",
                message.type === "positive" ? "text-emerald-400" :
                message.type === "warning" ? "text-amber-400" : "text-destructive"
              )}>{message.text}</p>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Budget Setup */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold text-card-foreground flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" /> Set Monthly Budgets
            </h3>
            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
              {CATEGORIES.map((cat) => (
                <div key={cat} className="flex items-center gap-3">
                  <label className="w-40 text-sm text-muted-foreground truncate">{cat}</label>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="0"
                      value={budgets[cat] || ""}
                      onChange={(e) => setBudgets((prev) => ({ ...prev, [cat]: e.target.value }))}
                      className="pl-7 bg-input text-sm h-9"
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Budgets
            </Button>
          </div>

          {/* Category Comparison */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold text-card-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Category Breakdown
            </h3>
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                Set budgets on the left to see your comparison
              </div>
            ) : (
              <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
                {items.map((item) => {
                  const pct = item.budget > 0 ? (item.actual / item.budget) * 100 : 100
                  const isOver = pct > 100
                  const isNear = pct >= 90 && pct <= 100
                  return (
                    <div key={item.category}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {isOver ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> :
                           isNear ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> :
                           <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                          <span className="text-sm font-medium text-card-foreground">{item.category}</span>
                        </div>
                        <span className={cn("text-xs font-semibold", isOver ? "text-destructive" : isNear ? "text-amber-400" : "text-emerald-400")}>
                          ₹{item.actual.toFixed(0)} / ₹{item.budget.toFixed(0)}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", isOver ? "bg-destructive" : isNear ? "bg-amber-500" : "bg-emerald-500")}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      {isOver && (
                        <p className="mt-0.5 text-xs text-destructive">Over by ₹{(item.actual - item.budget).toFixed(0)}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function BudgetPage() {
  return <Suspense><BudgetContent /></Suspense>
}
