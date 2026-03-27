"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { toast } from "sonner"
import { useSearchParams } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { fetchApiJson } from "@/lib/api"
import {
  ShoppingBag, Car, Utensils, Receipt, Coffee,
  Smartphone, Home, Briefcase, ChevronRight, Tag, Loader2, ChevronDown, Sparkles, LayoutGrid, CheckCircle2
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const CATEGORIES = [
  "Food", "Transport", "Shopping", "Entertainment",
  "Health", "Bills & Utilities", "Education", "Travel",
  "Coffee", "Groceries", "Salary", "Investment", "Other"
]

const categoryConfig: Record<string, { icon: any; color: string; bgColor: string; border: string }> = {
  Shopping:            { icon: ShoppingBag, color: "text-blue-500",   bgColor: "bg-blue-500/10",   border: "border-blue-500/20" },
  Transport:           { icon: Car,         color: "text-orange-500", bgColor: "bg-orange-500/10", border: "border-orange-500/20" },
  "Food":              { icon: Utensils,    color: "text-rose-500",   bgColor: "bg-rose-500/10",   border: "border-rose-500/20" },
  Groceries:           { icon: Utensils,    color: "text-emerald-500",bgColor: "bg-emerald-500/10",border: "border-emerald-500/20" },
  "Bills & Utilities": { icon: Receipt,     color: "text-indigo-500", bgColor: "bg-indigo-500/10", border: "border-indigo-500/20" },
  Coffee:              { icon: Coffee,      color: "text-amber-500",  bgColor: "bg-amber-500/10",  border: "border-amber-500/20" },
  Electronics:         { icon: Smartphone,  color: "text-cyan-500",   bgColor: "bg-cyan-500/10",   border: "border-cyan-500/20" },
  Entertainment:       { icon: Smartphone,  color: "text-purple-500", bgColor: "bg-purple-500/10", border: "border-purple-500/20" },
  Health:              { icon: Home,        color: "text-teal-500",   bgColor: "bg-teal-500/10",   border: "border-teal-500/20" },
  Education:           { icon: Briefcase,   color: "text-yellow-500", bgColor: "bg-yellow-500/10", border: "border-yellow-500/20" },
  Other:               { icon: LayoutGrid,  color: "text-gray-400",   bgColor: "bg-gray-500/10",   border: "border-gray-500/20" },
}

type Transaction = {
  id: string
  description: string
  amount: number
  date: string
  category: string
  keywords: string[]
}

function CategorizationContent() {
  const searchParams = useSearchParams()
  const timeFilter = searchParams.get("timeFilter") || "Last 30 days"

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [changingCategory, setChangingCategory] = useState(false)

  useEffect(() => {
    void fetchApiJson<any[]>("/api/transactions")
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setAllTransactions(data)
          setSelectedTransaction(data[0])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const transactions = useMemo(() => allTransactions, [allTransactions])

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
        setAllTransactions(data)
        setSelectedTransaction(data.find(t => t.id === selectedTransaction?.id) ?? data[0])
        toast.success("All transactions re-categorized!")
      }
    } catch {
      toast.error("Failed to re-categorize transactions.")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleChangeCategory = async (txId: string, newCategory: string) => {
    setChangingCategory(true)
    try {
      const data = await fetchApiJson<any>(`/api/transactions/${txId}/category`, {
        method: "PATCH",
        body: JSON.stringify({ new_category: newCategory }),
      })
      setAllTransactions(prev => prev.map(t => t.id === txId ? { ...t, ...data } : t))
      if (selectedTransaction?.id === txId) {
        setSelectedTransaction(prev => prev ? { ...prev, ...data } : prev)
      }
      toast.success(`Category updated to ${newCategory}`)
    } catch {
      toast.error("Failed to update category")
    } finally {
      setChangingCategory(false)
    }
  }

  return (
    <DashboardLayout>
      {/* Background ambient glows for premium feel */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-96 h-96 rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 rounded-full bg-blue-500/5 blur-[120px]" />
      </div>

      <div className="relative z-10 space-y-8 select-none">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-foreground to-foreground/70">
              Categorization AI
            </h1>
            <p className="text-muted-foreground text-lg">
              Review and perfect your transaction data
            </p>
          </div>
          <Button
            size="lg"
            className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow rounded-xl"
            onClick={handleRecategorizeAll}
            disabled={isProcessing || loading || allTransactions.length === 0}
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            {isProcessing ? "Analyzing..." : "Auto Re-categorize"}
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-12 items-start">
          
          {/* Main List Column */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            {loading ? (
              <div className="flex h-64 items-center justify-center rounded-3xl border border-white/5 bg-black/20 backdrop-blur-md">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex h-64 flex-col gap-4 items-center justify-center rounded-3xl border border-white/5 bg-black/20 backdrop-blur-md text-muted-foreground">
                <LayoutGrid className="w-10 h-10 opacity-20" />
                <p>No transactions found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => {
                  const cfg = categoryConfig[tx.category] ?? categoryConfig.Other
                  const Icon = cfg.icon
                  const isSelected = selectedTransaction?.id === tx.id
                  return (
                    <button
                      key={tx.id}
                      onClick={() => setSelectedTransaction(tx)}
                      className={cn(
                        "group w-full text-left transition-all duration-300 ease-out",
                        "rounded-2xl p-4 border relative overflow-hidden",
                        isSelected 
                          ? "border-primary/40 bg-primary/[0.03] shadow-md shadow-primary/5 ring-1 ring-primary/20 scale-[1.01]" 
                          : "border-border/40 bg-card/40 hover:bg-card/80 hover:border-border hover:shadow-sm"
                      )}
                    >
                      {/* Active highlight bar */}
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-2xl shadow-[0_0_10px_rgba(var(--primary),0.8)]" />
                      )}

                      <div className="flex items-center gap-5">
                        <div className={cn(
                          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300",
                          cfg.bgColor, cfg.border, "border shadow-inner group-hover:scale-110",
                          isSelected ? "scale-110" : "scale-100"
                        )}>
                          <Icon className={cn("h-6 w-6", cfg.color)} />
                        </div>
                        
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <p className="truncate font-semibold text-foreground/90 text-[1.1rem] leading-tight mb-1 group-hover:text-foreground transition-colors">
                            {tx.description}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span>{tx.date}</span>
                            <div className="w-1 h-1 rounded-full bg-border" />
                            <span className={cn("font-medium", cfg.color)}>{tx.category}</span>
                          </div>
                        </div>

                        <div className="text-right flex flex-col justify-center shrink-0 mr-2">
                          <p className="font-bold text-foreground text-lg">${Math.abs(tx.amount).toFixed(2)}</p>
                          {tx.keywords && tx.keywords.length > 0 && (
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-primary/70 mt-1 flex items-center justify-end gap-1">
                              <Sparkles className="w-3 h-3" /> AI Matched
                            </span>
                          )}
                        </div>

                        <ChevronRight className={cn(
                          "h-5 w-5 shrink-0 transition-transform duration-300",
                          isSelected ? "rotate-90 text-primary translate-x-1" : "text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-1"
                        )} />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sticky Details Column */}
          <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-8 space-y-5">
            <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-2xl shadow-2xl p-6 lg:p-8 overflow-hidden relative">
              {/* Decorative background element */}
              {selectedTransaction && (
                <div className={cn(
                  "absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[80px] opacity-20 pointer-events-none transition-colors duration-500",
                  (categoryConfig[selectedTransaction.category] ?? categoryConfig.Other).color.replace("text-", "bg-")
                )} />
              )}

              <h3 className="font-bold text-lg text-foreground mb-6 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Transaction Analysis
              </h3>
              
              {selectedTransaction ? (
                <div className="space-y-7 relative z-10">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Merchant / Description</p>
                    <p className="text-xl font-semibold text-foreground leading-tight">{selectedTransaction.description}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 p-3 rounded-2xl bg-white/5 border border-white/5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</p>
                      <p className="text-2xl font-bold text-foreground">${Math.abs(selectedTransaction.amount).toFixed(2)}</p>
                    </div>
                    <div className="space-y-1 p-3 rounded-2xl bg-white/5 border border-white/5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</p>
                      <p className="text-lg font-medium text-foreground mt-1">{selectedTransaction.date}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">AI Insight Vectors</p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedTransaction.keywords ?? []).length > 0 ? selectedTransaction.keywords.map((kw, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 border border-primary/20 px-3 py-1.5 text-sm font-medium text-primary shadow-sm">
                          <Tag className="h-3.5 w-3.5" /> {kw}
                        </span>
                      )) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/5 px-3 py-1.5 text-sm font-medium text-muted-foreground">
                          No specific keywords matched
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border/50">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Correction Override</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="lg"
                          disabled={changingCategory}
                          className="w-full justify-between border-white/10 bg-white/5 hover:bg-white/10 text-foreground rounded-xl h-14"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-3 h-3 rounded-full",
                              (categoryConfig[selectedTransaction.category] ?? categoryConfig.Other).bgColor.replace("/10", ""),
                              (categoryConfig[selectedTransaction.category] ?? categoryConfig.Other).color.replace("text-", "bg-")
                            )} />
                            <span className="font-semibold text-base">
                              {changingCategory ? "Updating AI..." : selectedTransaction.category}
                            </span>
                          </div>
                          <ChevronDown className="h-5 w-5 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] rounded-xl border-white/10 bg-black/90 backdrop-blur-xl p-2 shadow-2xl">
                        {CATEGORIES.map(cat => {
                          const catCfg = categoryConfig[cat] ?? categoryConfig.Other
                          const CIcon = catCfg.icon
                          return (
                            <DropdownMenuItem
                              key={cat}
                              onClick={() => handleChangeCategory(selectedTransaction.id, cat)}
                              disabled={cat === selectedTransaction.category}
                              className="rounded-lg py-3 px-3 cursor-pointer focus:bg-white/10 focus:text-foreground flex items-center gap-3"
                            >
                              <CIcon className={cn("w-4 h-4", catCfg.color)} />
                              <span className="font-medium">{cat}</span>
                            </DropdownMenuItem>
                          )
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center relative z-10">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                  <p className="text-lg font-medium text-foreground">No selection</p>
                  <p className="text-sm text-muted-foreground mt-1">Tap a transaction to view its AI analysis.</p>
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function CategorizationPage() {
  return <Suspense><CategorizationContent /></Suspense>
}

