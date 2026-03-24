"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Brain,
  Car,
  Coffee,
  Loader2,
  Receipt,
  ShoppingBag,
  Smartphone,
  Utensils,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { fetchApiJson } from "@/lib/api"
import { cn } from "@/lib/utils"

type Transaction = {
  id: string
  description: string
  amount: number
  date: string
  category: string
  confidence: number
  keywords?: string[]
}

const categoryIcons: Record<string, { icon: typeof ShoppingBag; color: string }> = {
  Shopping: { icon: ShoppingBag, color: "text-chart-2 bg-chart-2/10" },
  Transport: { icon: Car, color: "text-chart-1 bg-chart-1/10" },
  Food: { icon: Utensils, color: "text-chart-3 bg-chart-3/10" },
  Bills: { icon: Receipt, color: "text-chart-4 bg-chart-4/10" },
  Coffee: { icon: Coffee, color: "text-chart-5 bg-chart-5/10" },
  Electronics: { icon: Smartphone, color: "text-chart-2 bg-chart-2/10" },
  Entertainment: { icon: Smartphone, color: "text-chart-5 bg-chart-5/10" },
  Other: { icon: ShoppingBag, color: "text-chart-4 bg-chart-4/10" },
}

const fallbackTransactions: Transaction[] = []

export function RecentTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  
  const searchParams = useSearchParams()
  const timeFilter = searchParams.get("timeFilter") || "Last 30 days"

  useEffect(() => {
    setLoading(true)
    const filterEncoded = encodeURIComponent(timeFilter)
    void fetchApiJson<Transaction[]>(`/api/recent?timeFilter=${filterEncoded}`)
      .then((data) => {
        if (data && data.length > 0) {
          setTransactions(data)
        } else {
          setTransactions(fallbackTransactions)
        }
      })
      .catch((err) => {
        console.warn("Failed to load real data", err)
        setTransactions(fallbackTransactions)
      })
      .finally(() => setLoading(false))
  }, [timeFilter])

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="text-lg font-semibold text-card-foreground">Recent Transactions</h3>
        <span className="text-sm text-muted-foreground">Latest AI Categorizations</span>
      </div>
      <div className="divide-y divide-border">
        {loading ? (
          <div className="flex justify-center p-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No transactions processed yet.</div>
        ) : (
          transactions.map((transaction) => {
            const categoryConfig = categoryIcons[transaction.category] || categoryIcons.Other
            const Icon = categoryConfig.icon

            return (
              <div key={transaction.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-secondary/30">
                <div
                  className={cn(
                    "flex h-10 w-10 min-w-[40px] items-center justify-center rounded-lg",
                    categoryConfig.color
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-card-foreground">{transaction.description}</p>
                  <div className="mt-1 flex items-center gap-2 text-wrap text-sm text-muted-foreground">
                    <span>{transaction.date}</span>
                    <span>&bull;</span>

                    <TooltipProvider>
                      <Tooltip delayDuration={150}>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 text-primary transition-colors hover:bg-primary/10">
                            <Brain className="h-3 w-3" />
                            {transaction.category}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px] border-emerald-500/20 bg-card p-3 shadow-xl">
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-foreground">AI Explainability</p>
                            <p className="text-[11px] text-muted-foreground">
                              Model chose <strong className="text-primary">{transaction.category}</strong> with{" "}
                              <strong className="text-emerald-400">{transaction.confidence}%</strong> confidence.
                            </p>
                            {transaction.keywords && transaction.keywords.length > 0 && (
                              <div className="mt-2 border-t border-border/50 pt-2">
                                <p className="mb-1 text-[10px] text-muted-foreground">Key Influencing Words:</p>
                                <div className="flex flex-wrap gap-1">
                                  {transaction.keywords.map((kw, i) => (
                                    <span
                                      key={i}
                                      className="rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"
                                    >
                                      "{kw}"
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <div className="whitespace-nowrap text-right">
                  <p className="font-semibold text-card-foreground">${Math.abs(transaction.amount).toFixed(2)}</p>
                  <p className="mt-1 text-xs text-emerald-400">{transaction.confidence}% confidence</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
