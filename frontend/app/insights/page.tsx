"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { cn } from "@/lib/utils"
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  Target,
  PiggyBank,
  ArrowRight,
  Download,
  Loader2,
} from "lucide-react"
import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { fetchApiJson } from "@/lib/api"

type InsightType = "habit" | "unusual" | "recommendation" | "budget"

interface Insight {
  id: number
  type: InsightType
  icon: string
  title: string
  description: string
  impact: "positive" | "warning" | "neutral"
  action: string
  details: string[]
}

const iconMap: Record<string, any> = {
  "TrendingUp": TrendingUp,
  "TrendingDown": TrendingDown,
  "AlertTriangle": AlertTriangle,
  "Lightbulb": Lightbulb,
  "Target": Target,
  "PiggyBank": PiggyBank,
}

const impactColors = {
  positive: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    icon: "text-emerald-400",
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    icon: "text-amber-400",
  },
  neutral: {
    bg: "bg-chart-1/10",
    border: "border-chart-1/30",
    text: "text-chart-1",
    icon: "text-chart-1",
  },
}

function InsightsContent() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const timeFilter = searchParams.get("timeFilter") || "Last 30 days"

  const fetchInsights = async () => {
    setIsRefreshing(true)
    try {
      const filterEncoded = encodeURIComponent(timeFilter)
      const data = await fetchApiJson<Insight[]>(`/api/insights?timeFilter=${filterEncoded}`)
      setInsights(data || [])
    } catch (e) {
      console.warn("Failed to fetch insights", e)
      toast.error("Failed to load insights from backend.")
    } finally {
      setIsRefreshing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchInsights()
  }, [timeFilter])

  const handleRefresh = () => {
    fetchInsights()
    toast.success("Insights refreshed!")
  }

  const handleExportCSV = () => {
    if (!insights || insights.length === 0) return toast.info("No insights to export.")
    
    let csvContent = "Type,Title,Description,Impact,Action,Details\n"
    insights.forEach(insight => {
      const type = `"${insight.type}"`
      const title = `"${insight.title.replace(/"/g, '""')}"`
      const desc = `"${insight.description.replace(/"/g, '""')}"`
      const impact = `"${insight.impact}"`
      const action = `"${insight.action}"`
      const detailsStr = insight.details.join(" | ")
      const details = `"${detailsStr.replace(/"/g, '""')}"`
      
      csvContent += `${type},${title},${desc},${impact},${action},${details}\n`
    })

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "ExpenseAI_Insights.csv"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    toast.success("Insights data exported as CSV")
  }

  const handleActionClick = (action: string) => {
    switch (action) {
      case "Review transactions":
        router.push("/categorization")
        break
      case "Track this habit":
      case "View subscriptions":
      case "View budget":
      case "Compare options":
      default:
        router.push("/analytics")
        break
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Insights</h1>
            <p className="text-muted-foreground">
              Personalized recommendations and spending analysis powered by AI
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline"
              className="gap-2"
              onClick={handleExportCSV}
              disabled={loading || insights.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button 
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
            >
              <Sparkles className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              {isRefreshing ? "Refreshing..." : "Refresh Insights"}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
                <TrendingDown className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Potential Savings
                </p>
                <p className="text-xl font-bold text-emerald-400">
                  $136.97/mo
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Anomalies Detected
                </p>
                <p className="text-xl font-bold text-amber-400">2</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-chart-1/30 bg-chart-1/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/20">
                <Target className="h-5 w-5 text-chart-1" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Budget Health</p>
                <p className="text-xl font-bold text-chart-1">Good</p>
              </div>
            </div>
          </div>
        </div>

        {/* Insights List */}
        <div className="space-y-4">
          {insights.length === 0 && !loading && (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground shadow-sm">
              <Lightbulb className="mx-auto mb-3 h-10 w-10 opacity-20" />
              <p className="font-medium text-card-foreground">No insights available</p>
              <p className="text-sm mt-1">Upload more transaction data or change the timeframe.</p>
            </div>
          )}
          {insights.map((insight) => {
            const colors = impactColors[insight.impact as keyof typeof impactColors]
            const Icon = iconMap[insight.icon as keyof typeof iconMap] || Target

            return (
              <div
                key={insight.id}
                className={cn(
                  "rounded-xl border bg-card p-6 transition-all duration-300 hover:shadow-lg",
                  colors.border
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
                      colors.bg
                    )}
                  >
                    <Icon className={cn("h-6 w-6", colors.icon)} />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="font-semibold text-card-foreground">
                        {insight.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {insight.description}
                      </p>
                    </div>

                    {/* Details */}
                    <div className="rounded-lg bg-secondary/50 p-3">
                      <ul className="space-y-1.5">
                        {insight.details.map((detail, index) => (
                          <li
                            key={index}
                            className="flex items-center gap-2 text-sm text-card-foreground"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            {detail}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Action */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleActionClick(insight.action)}
                      className={cn("gap-2 p-0 h-auto", colors.text)}
                    >
                      {insight.action}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}


export default function InsightsPage() {
  return (
    <Suspense>
      <InsightsContent />
    </Suspense>
  )
}

