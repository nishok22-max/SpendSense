"use client"

import { useEffect, useState, Suspense } from "react"
import { Brain, DollarSign, Receipt, TrendingUp } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { RecentTransactions } from "@/components/recent-transactions"
import { StatCard } from "@/components/stat-card"
import { fetchApiJson } from "@/lib/api"

type AnalyticsResponse = {
  totalSpending?: number
  predictionAccuracy?: number
  processedTransactions?: number
  spendingByCategory?: Array<{ name: string; value: number }>
}

function DashboardContent() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  
  const searchParams = useSearchParams()
  const timeFilter = searchParams.get("timeFilter") || "Last 30 days"

  useEffect(() => {
    const filterEncoded = encodeURIComponent(timeFilter)
    void fetchApiJson<AnalyticsResponse>(`/api/analytics?timeFilter=${filterEncoded}`)
      .then((fetchedData) => {
        setData(fetchedData)
      })
      .catch((err) => {
        console.warn("Failed to fetch analytics", err)
      })
  }, [timeFilter])

  const totalSpending = data?.totalSpending ?? 0
  const predictionAccuracy = Math.max(data?.predictionAccuracy || 0, 0)
  const processedTransactions = data?.processedTransactions ?? 0

  let topCategory = "-"
  let topCategoryAmount = 0

  if (data?.spendingByCategory && data.spendingByCategory.length > 0) {
    const sorted = [...data.spendingByCategory].sort((a, b) => b.value - a.value)
    topCategory = sorted[0].name
    topCategoryAmount = sorted[0].value
  }

  const percentageOfTotal =
    totalSpending > 0
      ? `${((topCategoryAmount / totalSpending) * 100).toFixed(1)}% of total spending`
      : "N/A"

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your expense categorization and AI spending insights
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Monthly Spending"
            value={`$${totalSpending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            change="Currently active dataset"
            changeType="neutral"
            icon={DollarSign}
            iconColor="text-chart-1"
          />
          <StatCard
            title="Top Expense Category"
            value={topCategory}
            change={percentageOfTotal}
            changeType="neutral"
            icon={TrendingUp}
            iconColor="text-chart-2"
          />
          <StatCard
            title="AI Prediction Accuracy"
            value={`${predictionAccuracy}%`}
            change="Scikit-Learn NLP powered"
            changeType="positive"
            icon={Brain}
            iconColor="text-chart-3"
          />
          <StatCard
            title="Transactions Processed"
            value={String(processedTransactions)}
            change="In live session"
            changeType="positive"
            icon={Receipt}
            iconColor="text-chart-4"
          />
        </div>

        <RecentTransactions />
      </div>
    </DashboardLayout>
  )
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  )
}
