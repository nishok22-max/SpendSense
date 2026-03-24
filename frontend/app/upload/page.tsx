"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, FileText, Loader2, Plus, Upload, X, Trash2 } from "lucide-react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchApiJson } from "@/lib/api"
import { cn } from "@/lib/utils"

interface UploadedTransaction {
  id: string
  description: string
  amount: number
  date: string
  category?: string
  confidence?: number
  keywords?: string[]
  status: "pending" | "processed"
}

function UploadContent() {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [manualDescription, setManualDescription] = useState("")
  const [transactions, setTransactions] = useState<UploadedTransaction[]>([])
  const [errors, setErrors] = useState<{row: number, issue: string}[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    void fetchApiJson<Omit<UploadedTransaction, "status">[]>("/api/recent")
      .then((data) => {
        if (Array.isArray(data)) {
          setTransactions(data.map((transaction) => ({ ...transaction, status: "processed" })))
        }
      })
      .catch((err) => {
        console.error("Backend not reachable", err)
      })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      setUploadedFile(files[0])
    }
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setUploadedFile(files[0])
    }
  }, [])

  const addManualTransaction = () => {
    if (manualDescription.trim()) {
      setTransactions((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          description: manualDescription,
          amount: 0,
          date: new Date().toISOString().split("T")[0],
          status: "pending",
        },
      ])
      setManualDescription("")
    }
  }

  const removeFile = () => {
    setUploadedFile(null)
    setErrors([])
  }

  const processFile = async () => {
    if (!uploadedFile) {
      return
    }

    setIsProcessing(true)

    try {
      setErrors([])
      const formData = new FormData()
      formData.append("file", uploadedFile)

      const data = await fetchApiJson<{
        transactions: Omit<UploadedTransaction, "status">[]
        errors: {row: number, issue: string}[]
      }>("/api/upload", {
        method: "POST",
        body: formData,
      })

      setTransactions((prev) => [
        ...data.transactions.map((transaction) => ({ ...transaction, status: "processed" as const })),
        ...prev,
      ])
      
      if (data.errors && data.errors.length > 0) {
        setErrors(data.errors)
        toast.error(`Processed with ${data.errors.length} row errors.`)
      } else {
        toast.success("File processed successfully!")
      }
    } catch (e: any) {
      console.warn("Upload failed", e)
      const msg = e.detail || e.message || "Failed to process CSV file."
      toast.error(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeleteAllData = async () => {
    if (!window.confirm("Are you sure you want to delete ALL uploaded transactions? This cannot be undone.")) {
      return
    }
    
    setIsProcessing(true)
    try {
      await fetchApiJson("/api/transactions", { method: "DELETE" })
      setTransactions([])
      toast.success("All data has been wiped. Your account is fresh!")
    } catch (e: any) {
      toast.error(e.message || "Failed to delete data")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Upload Transactions</h1>
            <p className="text-muted-foreground">
              Import your transactions via CSV upload. Let the AI categorize them automatically!
            </p>
          </div>
          <Button 
            variant="outline" 
            className="border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={handleDeleteAllData}
            disabled={isProcessing || transactions.length === 0}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove all data
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "relative flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all duration-300",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/50 hover:bg-card/80",
                uploadedFile && "border-emerald-500/50 bg-emerald-500/5"
              )}
            >
              {uploadedFile ? (
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">File uploaded successfully</p>
                    <p className="text-sm text-muted-foreground">{uploadedFile.name}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={removeFile} className="gap-2">
                    <X className="h-4 w-4" />
                    Remove file
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Upload className="h-8 w-8 text-primary" />
                  </div>
                  <div className="mt-4 text-center">
                    <p className="font-medium text-foreground">Drag and drop your CSV file here</p>
                    <p className="mt-1 text-sm text-muted-foreground">or click to browse from your computer</p>
                  </div>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileInput}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span>Supports CSV with Date, Description, Amount columns</span>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 font-semibold text-card-foreground">Manual Entry</h3>
              <div className="flex gap-3">
                <Input
                  placeholder="Enter transaction description..."
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addManualTransaction()}
                  className="flex-1 border-input bg-input text-foreground placeholder:text-muted-foreground"
                />
                <Button onClick={addManualTransaction} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>

              {errors.length > 0 && (
                <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                  <h4 className="mb-2 font-medium text-red-500">Upload Errors ({errors.length})</h4>
                  <div className="max-h-[150px] overflow-y-auto space-y-2">
                    {errors.map((err, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="font-medium text-red-400">Row {err.row}</span>
                        <span className="text-red-400/80">{err.issue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="font-semibold text-card-foreground">Transaction Preview</h3>
              <span className="text-sm text-muted-foreground">{transactions.length} transactions</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-left text-sm text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="text-sm transition-colors hover:bg-secondary/30">
                      <td className="px-4 py-3 font-medium text-card-foreground">{transaction.description}</td>
                      <td className="px-4 py-3 text-card-foreground">${Math.abs(transaction.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {transaction.category || "-"}
                        {transaction.confidence && (
                          <span className="mt-1 block w-max rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-400">
                            {transaction.confidence}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                            transaction.status === "processed"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-amber-500/10 text-amber-400"
                          )}
                        >
                          {transaction.status === "processed" ? "Processed" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="mt-5 border-t border-border p-8 text-center text-muted-foreground">
                        No transactions yet. Upload a CSV to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border p-4">
              <Button
                disabled={!uploadedFile || isProcessing}
                onClick={processFile}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isProcessing ? "Processing via AI..." : "Process All Transactions"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}


export default function UploadPage() {
  return (
    <Suspense>
      <UploadContent />
    </Suspense>
  )
}

