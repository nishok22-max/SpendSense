"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Car, Coffee, Loader2, Receipt, ShoppingBag, Smartphone, Utensils,
} from "lucide-react"
import { fetchApiJson } from "@/lib/api"
import { cn } from "@/lib/utils"

type Transaction = {
  id: string
  description: string
  amount: number
  date: string
  category: string
}

const categoryIcons: Record<string, { icon: typeof ShoppingBag; color: string }> = {
  Shopping:         { icon: ShoppingBag, color: "text-chart-2 bg-chart-2/10" },
  Transport:        { icon: Car,         color: "text-chart-1 bg-chart-1/10" },
  "Food":           { icon: Utensils,    color: "text-chart-3 bg-chart-3/10" },
  Groceries:        { icon: Utensils,    color: "text-chart-3 bg-chart-3/10" },
  "Bills & Utilities": { icon: Receipt,  color: "text-chart-4 bg-chart-4/10" },
  Coffee:           { icon: Coffee,      color: "text-chart-5 bg-chart-5/10" },
  Electronics:      { icon: Smartphone,  color: "text-chart-2 bg-chart-2/10" },
  Entertainment:    { icon: Smartphone,  color: "text-chart-5 bg-chart-5/10" },
  Other:            { icon: ShoppingBag, color: "text-chart-4 bg-chart-4/10" },
}

export function RecentTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const searchParams = useSearchParams()
  const timeFilter = searchParams.get("timeFilter") || "Last 30 days"

  useEffect(() => {
    setLoading(true)
    void fetchApiJson<Transaction[]>(`/api/recent?timeFilter=${encodeURIComponent(timeFilter)}`)
      .then((data) => setTransactions(Array.isArray(data) ? data : []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false))
  }, [timeFilter])

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="text-lg font-semibold text-card-foreground">Recent Transactions</h3>
        <span className="text-sm text-muted-foreground">Latest categorized entries</span>
      </div>
      <div className="divide-y divide-border">
        {loading ? (
          <div className="flex justify-center p-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No transactions yet. Upload a file or add one manually.</div>
        ) : (
          transactions.map((tx) => {
            const cfg = categoryIcons[tx.category] ?? categoryIcons.Other
            const Icon = cfg.icon
            return (
              <div key={tx.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-secondary/30">
                <div className={cn("flex h-10 w-10 min-w-[40px] items-center justify-center rounded-lg", cfg.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-card-foreground">{tx.description}</p>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{tx.date}</span>
                    <span>&bull;</span>
                    <span className="rounded-md px-1.5 py-0.5 text-primary bg-primary/10 text-xs">
                      {tx.category}
                    </span>
                  </div>
                </div>
                <div className="whitespace-nowrap text-right">
                  <p className="font-semibold text-card-foreground">${Math.abs(tx.amount).toFixed(2)}</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
