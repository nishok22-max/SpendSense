"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { toast } from "sonner"
import { useSearchParams } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { fetchApiJson } from "@/lib/api"
import {
  ShoppingBag,
  Car,
  Utensils,
  Receipt,
  Coffee,
  Smartphone,
  Home,
  Briefcase,
  ChevronRight,
  Sparkles,
  Tag,
  Loader2,
  ChevronDown,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const categoryConfig: Record<
  string,
  { icon: typeof ShoppingBag; color: string; bgColor: string }
> = {
  Shopping: {
    icon: ShoppingBag,
    color: "text-chart-2",
    bgColor: "bg-chart-2/10",
  },
  Transport: { icon: Car, color: "text-chart-1", bgColor: "bg-chart-1/10" },
  Food: { icon: Utensils, color: "text-chart-3", bgColor: "bg-chart-3/10" },
  Bills: { icon: Receipt, color: "text-chart-4", bgColor: "bg-chart-4/10" },
  Coffee: { icon: Coffee, color: "text-chart-5", bgColor: "bg-chart-5/10" },
  Electronics: {
    icon: Smartphone,
    color: "text-chart-2",
    bgColor: "bg-chart-2/10",
  },
  Housing: { icon: Home, color: "text-chart-1", bgColor: "bg-chart-1/10" },
  Work: { icon: Briefcase, color: "text-chart-3", bgColor: "bg-chart-3/10" },
}

type Transaction = {
  id: string
  description: string
  amount: number
  date: string
  category: string
  confidence: number
  keywords: string[]
  reasoning: string
}

const defaultTransactions: Transaction[] = []

function CategorizationContent() {
  const searchParams = useSearchParams()
  const timeFilter = searchParams.get("timeFilter") || "Last 30 days"

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchApiJson<any[]>("/api/transactions")
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map((d) => ({
             ...d, 
             reasoning: `Identified mainly based on matching keywords: ${d.keywords?.join(", ") || "none"}`
          }))
          setAllTransactions(mapped)
          setSelectedTransaction(mapped[0])
        } else {
          setAllTransactions(defaultTransactions)
          setSelectedTransaction(defaultTransactions[0])
        }
      })
      .catch(() => {
        setAllTransactions(defaultTransactions)
        setSelectedTransaction(defaultTransactions[0])
      })
      .finally(() => setLoading(false))
  }, [])

  const transactions = useMemo(() => {
    if (!allTransactions.length) return []
    if (timeFilter === "All time") return allTransactions
    
    // Mock proportional data truncation to visually demonstrate filtering
    if (timeFilter === "Last 7 days") {
      return allTransactions.slice(0, Math.max(1, Math.floor(allTransactions.length * 0.3)))
    } else if (timeFilter === "Last 30 days") {
      return allTransactions.slice(0, Math.max(1, Math.floor(allTransactions.length * 0.8)))
    } else if (timeFilter === "Last 90 days") {
      return allTransactions.slice(0, Math.max(1, Math.floor(allTransactions.length * 0.9)))
    } else if (timeFilter === "This year") {
      return allTransactions.slice(0, Math.max(1, Math.floor(allTransactions.length * 0.95)))
    }
    return allTransactions
  }, [allTransactions, timeFilter])

  useEffect(() => {
    if (transactions.length > 0 && (!selectedTransaction || !transactions.find(t => t.id === selectedTransaction.id))) {
      setSelectedTransaction(transactions[0])
    } else if (transactions.length === 0) {
      setSelectedTransaction(null)
    }
  }, [transactions])

  const handleRecategorizeAll = async () => {
    setIsProcessing(true)
    try {
      const data = await fetchApiJson<any[]>("/api/recategorize", { method: "POST" })
      if (Array.isArray(data) && data.length > 0) {
        const mapped = data.map((d) => ({
           ...d, 
           reasoning: `Identified mainly based on matching keywords: ${d.keywords?.join(", ") || "none"}`
        }))
        setAllTransactions(mapped)
        if (!selectedTransaction || !mapped.find(t => t.id === selectedTransaction.id)) {
          setSelectedTransaction(mapped[0])
        } else {
          setSelectedTransaction(mapped.find(t => t.id === selectedTransaction.id)!)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAction = (actionName: string) => {
     toast.success(`${actionName} action recorded successfully! (Mock)`)
  }

  const [changingCategory, setChangingCategory] = useState(false)

  const handleChangeCategory = async (txId: string, newCategory: string) => {
    try {
      setChangingCategory(true)
      const data = await fetchApiJson<any>(`/api/transactions/${txId}/category`, {
        method: "PATCH",
        body: JSON.stringify({ new_category: newCategory })
      })
      
      const newReasoning = "User specified category manually"
      
      setAllTransactions(prev => prev.map(t => t.id === txId ? { ...t, category: data.category, confidence: data.confidence, keywords: data.keywords, reasoning: newReasoning } : t))
      if (selectedTransaction?.id === txId) {
        setSelectedTransaction(prev => prev ? { ...prev, category: data.category, confidence: data.confidence, keywords: data.keywords, reasoning: newReasoning } : prev)
      }
      toast.success(`Category updated to ${newCategory}`)
    } catch(e) {
      console.error(e)
      toast.error("Failed to update category")
    } finally {
      setChangingCategory(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              AI Categorization
            </h1>
            <p className="text-muted-foreground">
              Review AI-predicted categories with explainable insights
            </p>
          </div>
          <Button 
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleRecategorizeAll}
            disabled={isProcessing || loading}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isProcessing ? "Re-categorizing..." : "Re-categorize All"}
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Transaction List */}
          <div className="lg:col-span-2 space-y-3">
            {loading ? (
              <div className="flex h-[200px] items-center justify-center border rounded-xl">
                 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.map((transaction) => {
              const config =
                categoryConfig[transaction.category] || categoryConfig.Shopping
              const Icon = config.icon
              const isSelected = selectedTransaction?.id === transaction.id

              return (
                <button
                  key={transaction.id}
                  onClick={() => setSelectedTransaction(transaction)}
                  className={cn(
                    "w-full rounded-xl border p-4 text-left transition-all duration-200",
                    isSelected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card hover:border-primary/30"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-lg",
                        config.bgColor
                      )}
                    >
                      <Icon className={cn("h-6 w-6", config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-card-foreground">
                        {transaction.description}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {transaction.date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-card-foreground">
                        ${transaction.amount.toFixed(2)}
                      </p>
                      <div className="flex items-center justify-end gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            config.bgColor,
                            config.color
                          )}
                        >
                          {transaction.category}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        "h-5 w-5 text-muted-foreground transition-transform",
                        isSelected && "rotate-90 text-primary"
                      )}
                    />
                  </div>

                  {/* Confidence Bar */}
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      Confidence
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          transaction.confidence >= 95
                            ? "bg-emerald-400"
                            : transaction.confidence >= 90
                            ? "bg-chart-1"
                            : "bg-amber-400"
                        )}
                        style={{ width: `${transaction.confidence}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        transaction.confidence >= 95
                          ? "text-emerald-400"
                          : transaction.confidence >= 90
                          ? "text-chart-1"
                          : "text-amber-400"
                      )}
                    >
                      {transaction.confidence}%
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Explainable AI Panel */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-card-foreground">
                  AI Explanation
                </h3>
              </div>

              {selectedTransaction && (
                <div className="space-y-4">
                  {/* Keywords */}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Key Words Detected
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTransaction.keywords.map((keyword, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                        >
                          <Tag className="h-3 w-3" />
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Reasoning */}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Model Reasoning
                    </p>
                    <div className="rounded-lg bg-secondary/50 p-4">
                      <p className="text-sm leading-relaxed text-card-foreground">
                        {selectedTransaction.reasoning}
                      </p>
                    </div>
                  </div>

                  {/* Confidence Details */}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Confidence Breakdown
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Merchant Match
                        </span>
                        <span className="text-emerald-400">High</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Keyword Score
                        </span>
                        <span className="text-emerald-400">
                          {selectedTransaction.keywords.length * 23}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Amount Pattern
                        </span>
                        <span className="text-chart-1">Typical</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">
                Quick Actions
              </p>
              <div className="space-y-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={changingCategory || !selectedTransaction}
                      className="w-full justify-between border-border text-card-foreground hover:bg-secondary"
                    >
                      {changingCategory ? "Updating..." : "Change Category"}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                    {Object.keys(categoryConfig).map(catName => (
                      <DropdownMenuItem 
                        key={catName} 
                        onClick={() => selectedTransaction && handleChangeCategory(selectedTransaction.id, catName)}
                        disabled={catName === selectedTransaction?.category}
                      >
                        {catName}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  onClick={() => handleAction("Flag for Review")}
                  className="w-full justify-start border-border text-card-foreground hover:bg-secondary"
                >
                  Flag for Review
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleAction("Add to Training Data")}
                  className="w-full justify-start border-border text-card-foreground hover:bg-secondary"
                >
                  Add to Training Data
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function CategorizationPage() {
  return (
    <Suspense>
      <CategorizationContent />
    </Suspense>
  )
}
