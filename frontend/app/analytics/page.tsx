"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Brain, Loader2, Download
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { DashboardLayout } from "@/components/dashboard-layout"
import { fetchApiJson } from "@/lib/api"

const COLORS = [
  "hsl(280, 60%, 60%)",
  "hsl(60, 70%, 65%)",
  "hsl(180, 70%, 50%)",
  "hsl(340, 75%, 55%)",
  "hsl(140, 60%, 55%)",
  "hsl(200, 60%, 55%)",
]

type AnalyticsResponse = {
  spendingByCategory: Array<{ name: string; value: number }>
  dailyTrends: Array<{ date: string; spending: number; cumulative: number }>
  monthlyTrends: Array<{ month: string; spending: number; cumulative: number }>
  totalSpending: number
  predictionAccuracy: number
  processedTransactions: number
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color?: string }>
  label?: string
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="z-50 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
        <p className="text-sm font-medium text-popover-foreground">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: ${entry.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        ))}
      </div>
    )
  }

  return null
}

function AnalyticsContent() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [historyView, setHistoryView] = useState<"daily" | "monthly">("monthly")
  
  const searchParams = useSearchParams()
  const timeFilter = searchParams.get("timeFilter") || "Last 30 days"

  const handleExportCSV = () => {
    if (!data) return
    let csvContent = "Category,Spending\n"
    data.spendingByCategory.forEach(item => {
      csvContent += `"${item.name}",${item.value}\n`
    })

    csvContent += "\nMonth,Monthly Spending\n"
    data.monthlyTrends.forEach(item => {
      csvContent += `"${item.month}",${item.spending}\n`
    })

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `ExpenseAI_Analytics_${timeFilter.replace(/\s+/g, "_")}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    toast.success("Analytics data exported as CSV")
  }

  useEffect(() => {
    setLoading(true)
    const filterEncoded = encodeURIComponent(timeFilter)
    void fetchApiJson<AnalyticsResponse>(`/api/analytics?timeFilter=${filterEncoded}`)
      .then((fetchedData) => {
        setData(fetchedData)
      })
      .catch((err) => console.error("Failed to fetch analytics:", err))
      .finally(() => setLoading(false))
  }, [timeFilter])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin cursor-wait text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  const fallbackCategoryData: any[] = []
  const fallbackMonthlyTrend: any[] = []

  const categoryData = (data?.spendingByCategory || fallbackCategoryData).map((item, idx) => ({
    ...item,
    color: COLORS[idx % COLORS.length],
  }))

  const barData = categoryData
    .map((item) => ({
      category: item.name,
      amount: item.value,
    }))
    .sort((a, b) => b.amount - a.amount)

  const trendData = data ? (historyView === "daily" ? data.dailyTrends : data.monthlyTrends) : []
  const trendXKey = historyView === "daily" ? "date" : "month"

  const totalSpending = data?.totalSpending || categoryData.reduce((sum, item) => sum + item.value, 0)
  const predictionAccuracy = Math.max(data?.predictionAccuracy || 0, 0)

  let highestCat = { name: "None", value: 0 }
  if (categoryData.length > 0) {
    highestCat = [...categoryData].sort((a, b) => b.value - a.value)[0]
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Spending Analytics</h1>
            <p className="text-muted-foreground">
              Visualize your categorized spending patterns powered by our AI models
            </p>
          </div>
          <Button 
            variant="outline"
            className="gap-2"
            onClick={handleExportCSV}
            disabled={!data || loading}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <div className="relative z-0 grid gap-6 lg:grid-cols-2">
          <div className="min-h-[400px] rounded-xl border border-border bg-card p-6">
            <h3 className="mb-4 font-semibold text-card-foreground">Category Distribution</h3>
            <div className="h-[300px]">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload as { name: string; value: number; color: string }
                          return (
                            <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
                              <p className="text-sm font-medium text-popover-foreground">{item.name}</p>
                              <p className="text-sm" style={{ color: item.color }}>
                                ${item.value.toLocaleString()} ({totalSpending > 0 ? ((item.value / totalSpending) * 100).toFixed(1) : 0}%)
                              </p>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Legend
                      formatter={(value) => (
                        <span className="ml-1 text-sm text-muted-foreground">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data available</div>
              )}
            </div>
          </div>

          <div className="min-h-[400px] rounded-xl border border-border bg-card p-6">
            <h3 className="mb-4 font-semibold text-card-foreground">Spending by Category</h3>
            <div className="h-[300px]">
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(260, 10%, 22%)"
                      horizontal={true}
                      vertical={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fill: "hsl(0, 0%, 60%)", fontSize: 12 }}
                      axisLine={{ stroke: "hsl(260, 10%, 22%)" }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <YAxis
                      dataKey="category"
                      type="category"
                      tick={{ fill: "hsl(0, 0%, 60%)", fontSize: 12 }}
                      axisLine={{ stroke: "hsl(260, 10%, 22%)" }}
                      width={100}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(260, 10%, 18%)" }} />
                    <Bar dataKey="amount" fill="hsl(180, 70%, 50%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data available</div>
              )}
            </div>
          </div>

          <div className="min-h-[400px] rounded-xl border border-border bg-card p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-card-foreground">History & Cumulative Spending</h3>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant={historyView === "daily" ? "default" : "outline"} 
                  onClick={() => setHistoryView("daily")}
                >
                  Daily
                </Button>
                <Button 
                  size="sm" 
                  variant={historyView === "monthly" ? "default" : "outline"} 
                  onClick={() => setHistoryView("monthly")}
                >
                  Monthly
                </Button>
              </div>
            </div>
            <div className="h-[300px]">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(260, 10%, 22%)" />
                    <XAxis
                      dataKey={trendXKey}
                      tick={{ fill: "hsl(0, 0%, 60%)", fontSize: 12 }}
                      axisLine={{ stroke: "hsl(260, 10%, 22%)" }}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: "hsl(0, 0%, 60%)", fontSize: 12 }}
                      axisLine={{ stroke: "hsl(260, 10%, 22%)" }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: "hsl(0, 0%, 60%)", fontSize: 12 }}
                      axisLine={{ stroke: "hsl(260, 10%, 22%)" }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(180, 70%, 50%)", strokeWidth: 1 }} />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      name="Spending"
                      dataKey="spending"
                      stroke="hsl(180, 70%, 50%)"
                      strokeWidth={3}
                      dot={{ fill: "hsl(180, 70%, 50%)", strokeWidth: 0, r: 4 }}
                      activeDot={{ r: 6, fill: "hsl(180, 70%, 50%)" }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      name="Cumulative"
                      dataKey="cumulative"
                      stroke="hsl(340, 75%, 55%)"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data available</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total Spending</p>
            <p className="mt-1 text-2xl font-bold text-card-foreground">
              ${totalSpending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{categoryData.length} categories tracked</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Highest Spending Category</p>
            <p className="mt-1 text-2xl font-bold text-card-foreground">{highestCat.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              ${Math.abs(highestCat.value).toLocaleString()} ({totalSpending > 0 ? ((highestCat.value / totalSpending) * 100).toFixed(1) : 0}%)
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function AnalyticsPage() {
  return (
    <Suspense>
      <AnalyticsContent />
    </Suspense>
  )
}
