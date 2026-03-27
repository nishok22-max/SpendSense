"use client"

import { useState, useRef, useCallback, Suspense } from "react"
import { toast } from "sonner"
import {
  Upload, Loader2, CheckCircle2, AlertTriangle, FileText,
  TrendingUp, DollarSign, Save, RefreshCw, X, Info,
} from "lucide-react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getApiBase } from "@/lib/api"

interface DebitTransaction {
  date: string
  name: string
  amount: number
  selected?: boolean
}

interface AnalysisResult {
  transactions: DebitTransaction[]
  summary: {
    total_debit_transactions: number
    skipped_rows: number
    total_pages: number
    used_ocr: boolean
    extraction_method: string
  }
}

function BankAnalyzerContent() {
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopProgress = () => { if (progressRef.current) clearInterval(progressRef.current) }

  const simulateProgress = () => {
    stopProgress()
    setProgress(0)
    progressRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 88) { stopProgress(); return p }
        return p + Math.random() * 3
      })
    }, 200)
  }

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF bank statements are supported")
      return
    }
    setFile(f)
    setResult(null)
    setSelected(new Set())
    setAnalyzing(true)
    simulateProgress()

    try {
      const token = localStorage.getItem("token") ?? ""
      const fd = new FormData()
      fd.append("file", f)
      const res = await fetch(`${getApiBase()}/api/analyze-statement`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Analysis failed") }
      const data: AnalysisResult = await res.json()
      stopProgress(); setProgress(100)
      setTimeout(() => {
        setResult(data)
        setSelected(new Set(data.transactions.map((_, i) => i)))
      }, 300)
      if (data.transactions.length === 0) toast.warning("No debit transactions found in this PDF")
      else toast.success(`Found ${data.transactions.length} debit transactions!`)
    } catch (e: any) {
      toast.error(e.message || "Failed to analyze statement")
    } finally {
      setAnalyzing(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const toggleAll = () => {
    if (!result) return
    if (selected.size === result.transactions.length) setSelected(new Set())
    else setSelected(new Set(result.transactions.map((_, i) => i)))
  }

  const handleSave = async () => {
    if (!result || selected.size === 0) { toast.error("Select at least one transaction to save"); return }
    setSaving(true)
    try {
      const token = localStorage.getItem("token") ?? ""
      const toSave = result.transactions.filter((_, i) => selected.has(i))
      const res = await fetch(`${getApiBase()}/api/save-debit-transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transactions: toSave }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Save failed") }
      const data = await res.json()
      toast.success(`✅ ${data.saved} transactions saved to your account!`)
      setResult(null); setFile(null); setSelected(new Set())
    } catch (e: any) {
      toast.error(e.message || "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const totalSelected = result
    ? result.transactions.filter((_, i) => selected.has(i)).reduce((s, t) => s + t.amount, 0)
    : 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-primary" />Bank Statement Analyzer
          </h1>
          <p className="text-muted-foreground">Upload a PDF bank statement to extract and save debit transactions (expenses)</p>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How it works</p>
            <p>Upload your bank statement PDF. The engine extracts <strong className="text-foreground">debit transactions</strong> (money spent) using table detection and text pattern recognition. Review the results, select what to save, then import to your account.</p>
          </div>
        </div>

        {/* Upload Zone */}
        {!result && (
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
            onDrop={handleDrop}
            className={cn(
              "relative flex min-h-[200px] flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all",
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/10",
              analyzing && "pointer-events-none"
            )}
          >
            {analyzing ? (
              <div className="w-full px-12 space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-6 w-6 text-primary animate-spin shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Analyzing <span className="text-primary">{file?.name}</span></p>
                    <p className="text-xs text-muted-foreground">Extracting tables, detecting debits, cleaning data...</p>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
                <p className="text-xs text-right text-muted-foreground">{Math.round(Math.min(progress, 100))}%</p>
              </div>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-3">
                  <FileText className="h-7 w-7 text-primary" />
                </div>
                <p className="text-base font-semibold text-foreground">Drop your PDF bank statement here</p>
                <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                <p className="text-xs text-muted-foreground mt-3">Supports: HDFC, ICICI, SBI, Axis, Kotak and most other bank formats</p>
                <input type="file" accept=".pdf"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
                  className="absolute inset-0 opacity-0 cursor-pointer" />
              </>
            )}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-5">
            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-xs text-muted-foreground">Debits Found</p>
                <p className="text-2xl font-bold text-emerald-400">{result.summary.total_debit_transactions}</p>
                <p className="text-xs text-muted-foreground mt-1">{result.summary.extraction_method} extraction</p>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold text-foreground">
                  ${result.transactions.reduce((s, t) => s + t.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{result.summary.total_pages} pages scanned</p>
              </div>
              <div className={cn("rounded-xl border p-4", result.summary.used_ocr ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card")}>
                <p className="text-xs text-muted-foreground">Rows Skipped</p>
                <p className="text-2xl font-bold text-foreground">{result.summary.skipped_rows}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {result.summary.used_ocr ? "⚠️ OCR may improve results" : "Non-transaction rows"}
                </p>
              </div>
            </div>

            {result.transactions.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-10 text-center space-y-3">
                <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto" />
                <p className="font-medium text-foreground">No debit transactions detected</p>
                <p className="text-sm text-muted-foreground">The PDF may use a format our engine can&apos;t parse yet, or it may not contain debit entries.</p>
                <Button variant="outline" onClick={() => { setResult(null); setFile(null) }} className="gap-2">
                  <RefreshCw className="h-4 w-4" />Try another file
                </Button>
              </div>
            ) : (
              <>
                {/* Transaction Table */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selected.size === result.transactions.length}
                        onChange={toggleAll} className="rounded" />
                      <p className="text-sm font-semibold text-card-foreground">
                        {selected.size} of {result.transactions.length} selected
                      </p>
                    </div>
                    <p className="text-sm font-medium text-primary">
                      ${totalSelected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} selected
                    </p>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="px-4 py-3 font-medium w-8"></th>
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Description</th>
                          <th className="px-4 py-3 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.transactions.map((tx, i) => (
                          <tr key={i}
                            onClick={() => toggleSelect(i)}
                            className={cn(
                              "cursor-pointer text-sm transition-colors",
                              selected.has(i) ? "bg-primary/5" : "hover:bg-secondary/20"
                            )}
                          >
                            <td className="px-4 py-3">
                              <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)}
                                onClick={e => e.stopPropagation()} className="rounded" />
                            </td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{tx.date}</td>
                            <td className="px-4 py-3 text-card-foreground max-w-[260px] truncate">{tx.name}</td>
                            <td className="px-4 py-3 font-semibold text-emerald-400 text-right whitespace-nowrap">
                              -${tx.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-4">
                  <Button variant="outline" onClick={() => { setResult(null); setFile(null) }} className="gap-2">
                    <X className="h-4 w-4" />Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving || selected.size === 0} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "Saving..." : `Save ${selected.size} Transaction${selected.size !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default function BankAnalyzerPage() {
  return <Suspense><BankAnalyzerContent /></Suspense>
}
