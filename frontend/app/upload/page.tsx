"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2, FileText, Loader2, Upload, X, Trash2,
  Plus, Clock, Tag, DollarSign, Calendar, Edit3,
  ArrowRight, AlertTriangle, RefreshCw, ChevronDown,
} from "lucide-react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchApiJson, getApiBase } from "@/lib/api"
import { cn } from "@/lib/utils"

const CATEGORIES = [
  "Food","Transport","Shopping","Entertainment",
  "Health","Bills & Utilities","Education","Travel",
  "Coffee","Groceries","Salary","Investment","Other",
]


function getCategorySuggestion(desc: string): string {
  const d = desc.toLowerCase()
  if (/coffee|tea|brew|starbucks|cafe/.test(d)) return "Coffee"
  if (/lunch|dinner|food|eat|restaurant|pizza|burger|swiggy|zomato/.test(d)) return "Food"
  if (/bus|auto|uber|ola|metro|train|cab|taxi/.test(d)) return "Transport"
  if (/amazon|flipkart|shop|mall|store|buy/.test(d)) return "Shopping"
  if (/netflix|spotify|game|movie|cinema/.test(d)) return "Entertainment"
  if (/doctor|hospital|medicine|pharmacy|clinic/.test(d)) return "Health"
  if (/electric|water|wifi|internet|phone|bill/.test(d)) return "Bills & Utilities"
  if (/grocery|vegetables|milk|fruits|dmart|blinkit/.test(d)) return "Groceries"
  if (/school|college|course|book|tuition/.test(d)) return "Education"
  if (/hotel|flight|trip|tour|holiday|airbnb/.test(d)) return "Travel"
  if (/salary|freelance|income|payment received/.test(d)) return "Salary"
  return "Other"
}

interface Transaction {
  id: string
  description: string
  amount: number
  date: string
  category?: string
  status: "pending" | "processed"
}

interface AnalysisResult {
  columns: string[]
  classifications: Record<string, { detected_type: string; confidence: number; from_learning?: boolean }>
  mapping: { date: string | null; amount: string | null; description: string | null }
  overall_confidence: number
  needs_review: boolean
  preview: Record<string, string>[]
  total_rows: number
}

type UploadStep = "idle" | "analyzing" | "mapping" | "importing" | "done"

function ConfidencePill({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  return (
    <span className={cn(
      "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
      pct >= 70 ? "bg-emerald-500/15 text-emerald-400" :
      pct >= 40 ? "bg-amber-500/15 text-amber-400" :
      "bg-red-500/15 text-red-400"
    )}>
      {pct}%
    </span>
  )
}

function ManualEntryForm({ onAdd }: { onAdd: (tx: Transaction) => void }) {
  const today = new Date().toISOString().split("T")[0]
  const [form, setForm] = useState({ description: "", amount: "", date: today, category: "Other" })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [suggestedCat, setSuggestedCat] = useState("")

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) e.amount = "Enter a positive amount"
    if (!form.date) e.date = "Date is required"
    else if (form.date > today) e.date = "Date cannot be in the future"
    return e
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    let cat = form.category
    try {
      if (cat === "Other") {
        const predData = await fetchApiJson<{ category: string }>("/api/predict", {
          method: "POST",
          body: JSON.stringify({ description: form.description || form.category }),
        })
        cat = predData.category
      }
      
      const payload = {
        description: form.description || cat,
        amount: Number(form.amount),
        date: form.date,
        category: cat
      }
      
      const savedTx = await fetchApiJson<Transaction>("/api/transactions", {
        method: "POST",
        body: JSON.stringify(payload)
      })
      
      onAdd({ ...savedTx, status: "processed" })
      setForm({ description: "", amount: "", date: today, category: "Other" })
      setSuggestedCat("")
      toast.success("Transaction added!")
    } catch (e: any) {
      toast.error(e.message || "Failed to add transaction")
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Edit3 className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-card-foreground">Add Manually</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><DollarSign className="h-3 w-3" />Amount *</label>
            <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className={cn("bg-input text-sm h-9", errors.amount && "border-destructive")} />
            {errors.amount && <p className="mt-1 text-xs text-destructive">{errors.amount}</p>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Calendar className="h-3 w-3" />Date *</label>
            <Input type="date" max={today} value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className={cn("bg-input text-sm h-9", errors.date && "border-destructive")} />
            {errors.date && <p className="mt-1 text-xs text-destructive">{errors.date}</p>}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Tag className="h-3 w-3" />Category</label>
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
          <Input placeholder="e.g. Lunch, Bus ticket..." value={form.description}
            onChange={e => { setForm(f => ({ ...f, description: e.target.value })); setSuggestedCat(getCategorySuggestion(e.target.value)) }}
            className="bg-input text-sm h-9" />
          {suggestedCat && suggestedCat !== form.category && (
            <button type="button" onClick={() => setForm(f => ({ ...f, category: suggestedCat }))}
              className="mt-1 text-xs text-primary hover:text-primary/80 flex items-center gap-1">
              ✨ Suggest: <strong>{suggestedCat}</strong> — apply?
            </button>
          )}
        </div>
        <Button type="submit" size="sm" className="w-full gap-2"><Plus className="h-3.5 w-3.5" />Add Transaction</Button>
      </form>
    </div>
  )
}

function MappingUI({
  analysis, file, onImported
}: {
  analysis: AnalysisResult
  file: File
  onImported: (count: number, skipped: number, txs: any[], errors: any[]) => void
}) {
  const [mapping, setMapping] = useState(analysis.mapping)
  const [importing, setImporting] = useState(false)

  const handleImport = async () => {
    if (!mapping.amount) { toast.error("Please select the Amount column"); return }
    setImporting(true)
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : ""
      const fd = new FormData()
      fd.append("file", file)
      if (mapping.date) fd.append("date_col", mapping.date)
      if (mapping.amount) fd.append("amount_col", mapping.amount)
      if (mapping.description) fd.append("description_col", mapping.description)

      const res = await fetch(`${getApiBase()}/api/import-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Import failed") }
      const data = await res.json()
      onImported(data.imported, data.skipped, data.transactions, data.errors)
      toast.success(`✅ ${data.imported} rows imported!`)
    } catch (e: any) {
      toast.error(e.message || "Import failed")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Confidence banner */}
      <div className={cn(
        "flex items-center gap-3 rounded-xl border p-4",
        analysis.needs_review ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"
      )}>
        {analysis.needs_review
          ? <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          : <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />}
        <div>
          <p className="text-sm font-semibold text-foreground">
            {analysis.needs_review ? "Low confidence — please review mapping" : "Auto-mapping successful"}
          </p>
          <p className="text-xs text-muted-foreground">
            Overall confidence: {Math.round(analysis.overall_confidence * 100)}% &bull; {analysis.total_rows} rows detected
          </p>
        </div>
      </div>

      {/* Column Classification */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h4 className="font-semibold text-card-foreground">Column Mapping</h4>
        <p className="text-xs text-muted-foreground">
          The system analyzed your CSV columns. Confirm or correct the mapping below.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {(["date", "amount", "description"] as const).map((field) => (
            <div key={field}>
              <label className="text-xs font-medium text-muted-foreground capitalize mb-1 block">
                {field} column {field === "amount" && <span className="text-destructive">*</span>}
              </label>
              <div className="relative">
                <select
                  value={mapping[field] ?? "__none__"}
                  onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value === "__none__" ? null : e.target.value }))}
                  className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="__none__">— Not mapped —</option>
                  {analysis.columns.map(col => (
                    <option key={col} value={col}>
                      {col} {analysis.classifications[col]?.from_learning ? "★" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        {/* Column scores table */}
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Column</th>
                <th className="pb-2 pr-4 font-medium">Detected As</th>
                <th className="pb-2 pr-4 font-medium">Confidence</th>
                <th className="pb-2 font-medium">Learned?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {analysis.columns.map(col => {
                const info = analysis.classifications[col]
                return (
                  <tr key={col} className="py-1.5">
                    <td className="py-1.5 pr-4 font-mono text-foreground">{col}</td>
                    <td className="py-1.5 pr-4 capitalize text-foreground">{info?.detected_type ?? "—"}</td>
                    <td className="py-1.5 pr-4"><ConfidencePill score={info?.confidence ?? 0} /></td>
                    <td className="py-1.5">{info?.from_learning ? <span className="text-emerald-400">★ Yes</span> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Table */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h4 className="font-semibold text-card-foreground">Data Preview <span className="text-muted-foreground font-normal text-sm">(first 8 rows)</span></h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {analysis.columns.slice(0, 6).map(col => (
                  <th key={col} className="pb-2 pr-4 font-medium">
                    {col}
                    {Object.entries(mapping).some(([, v]) => v === col) && (
                      <span className="ml-1 text-primary">●</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {analysis.preview.map((row, i) => (
                <tr key={i}>
                  {analysis.columns.slice(0, 6).map(col => (
                    <td key={col} className="py-1.5 pr-4 text-foreground max-w-[140px] truncate">{row[col] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Button onClick={handleImport} disabled={importing || !mapping.amount} className="w-full gap-2">
        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {importing ? "Importing & Categorizing..." : "Confirm & Import"}
      </Button>
    </div>
  )
}

function UploadContent() {
  const [step, setStep] = useState<UploadStep>("idle")
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [errors, setErrors] = useState<{ row: number; issue: string }[]>([])
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchApiJson<any[]>("/api/recent")
      .then(data => { if (Array.isArray(data)) setTransactions(data.map(t => ({ ...t, status: "processed" }))) })
      .catch(() => {})
  }, [])

  const stopProgress = () => { if (progressRef.current) clearInterval(progressRef.current) }

  const simulateProgress = (target: number) => {
    stopProgress()
    setUploadProgress(0)
    progressRef.current = setInterval(() => {
      setUploadProgress(p => { if (p >= target) { stopProgress(); return p } return p + 2 })
    }, 60)
  }

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setStep("analyzing")
    setErrors([])
    simulateProgress(85)

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : ""
      const fd = new FormData()
      fd.append("file", f)
      const res = await fetch(`${getApiBase()}/api/analyze-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Analysis failed") }
      const data: AnalysisResult = await res.json()
      stopProgress(); setUploadProgress(100)
      setTimeout(() => { setAnalysis(data); setStep("mapping") }, 400)
    } catch (e: any) {
      stopProgress(); setStep("idle"); setFile(null)
      toast.error(e.message || "Failed to analyze file")
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleImported = (imported: number, skipped: number, txs: any[], serverErrors: any[] = []) => {
    setImportResult({ imported, skipped })
    setTransactions(prev => [...txs.map((t: any) => ({ ...t, status: "processed" as const })), ...prev])
    if (serverErrors && serverErrors.length > 0) {
      setErrors(serverErrors)
    } else if (skipped > 0) {
      setErrors(Array.from({ length: skipped }, (_, i) => ({ row: i + 1, issue: "Invalid or missing data" })))
    }
    setStep("done")
  }

  const handleDeleteAll = async () => {
    if (!window.confirm("Delete ALL transactions? This cannot be undone.")) return
    try {
      await fetchApiJson("/api/transactions", { method: "DELETE" })
      setTransactions([]); toast.success("All data cleared!")
    } catch (e: any) { toast.error(e.message || "Failed to clear data") }
  }

  const reset = () => { setStep("idle"); setFile(null); setAnalysis(null); setImportResult(null); setErrors([]); setUploadProgress(0) }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Upload Transactions</h1>
            <p className="text-muted-foreground">Add manually or upload any CSV — our engine auto-detects columns</p>
          </div>
          <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={handleDeleteAll} disabled={transactions.length === 0}>
            <Trash2 className="mr-2 h-4 w-4" />Remove all data
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left panel */}
          <div className="space-y-4">
            <ManualEntryForm onAdd={t => setTransactions(p => [t, ...p])} />

            {/* File Upload Card */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="font-semibold text-card-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />Universal CSV Import
              </h3>

              {/* Step: idle */}
              {(step === "idle" || step === "done") && (
                <>
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
                    onDrop={handleDrop}
                    className={cn(
                      "relative flex min-h-[130px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition-all cursor-pointer",
                      isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/10"
                    )}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium text-foreground">Drop any CSV, Excel or PDF file</p>
                    <p className="text-xs text-muted-foreground mt-1">Any format — AI auto-detects columns</p>
                    <input type="file" accept=".csv,.xlsx,.xls,.pdf,.txt"
                      onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
                      className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                  {step === "done" && importResult && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                      <p className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />Import Complete
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ✅ {importResult.imported} rows imported &nbsp;•&nbsp; ⚠️ {importResult.skipped} rows skipped
                      </p>
                      <Button size="sm" variant="outline" onClick={reset} className="gap-1 h-7 text-xs">
                        <RefreshCw className="h-3 w-3" />Import another file
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* Step: analyzing */}
              {step === "analyzing" && (
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Analyzing <span className="text-primary">{file?.name}</span></p>
                      <p className="text-xs text-muted-foreground">Detecting columns, patterns, and data types...</p>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-right text-muted-foreground">{uploadProgress}%</p>
                </div>
              )}

              {/* Step: mapping */}
              {step === "mapping" && analysis && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">File: <span className="text-primary">{file?.name}</span></p>
                    <Button size="sm" variant="ghost" onClick={reset} className="h-7 text-xs gap-1 text-muted-foreground">
                      <X className="h-3 w-3" />Cancel
                    </Button>
                  </div>
                  <MappingUI analysis={analysis} file={file!} onImported={handleImported} />
                </div>
              )}

              {/* Errors */}
              {errors.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs font-medium text-amber-400 mb-2">{errors.length} rows skipped</p>
                  <div className="max-h-20 overflow-y-auto space-y-1">
                    {errors.slice(0, 10).map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground">Row {e.row}: {e.issue}</p>
                    ))}
                    {errors.length > 10 && <p className="text-xs text-muted-foreground">...and {errors.length - 10} more</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right panel — Transaction list */}
          <div className="rounded-xl border border-border bg-card flex flex-col">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="font-semibold text-card-foreground">Transaction Preview</h3>
              <span className="text-sm text-muted-foreground">{transactions.length} total</span>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[600px]">
              <table className="w-full">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="text-sm hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-card-foreground max-w-[140px] truncate">{tx.description}</td>
                      <td className="px-4 py-3 text-card-foreground">${Math.abs(tx.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{tx.category ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          tx.status === "processed" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                        )}>{tx.status}</span>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={4} className="p-10 text-center text-sm text-muted-foreground">No transactions yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function UploadPage() {
  return <Suspense><UploadContent /></Suspense>
}
