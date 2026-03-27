"use client"

import { useEffect, useState, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Sparkles, Loader2, CheckCircle2, XCircle, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fetchApiJson } from "@/lib/api"
import { toast } from "sonner"

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const status = searchParams.get("status") // "invalid" set by backend redirect

  const [state, setState] = useState<"loading" | "success" | "error">(
    status === "invalid" ? "error" : token ? "loading" : "error"
  )
  const [resendEmail, setResendEmail] = useState("")
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (!token || status === "invalid") {
      setState("error")
      return
    }
    // Token in URL means we came here directly (not via backend redirect).
    // This shouldn't normally happen since the backend redirects, but handle it.
    setState("loading")
    fetchApiJson(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setState("success"))
      .catch(() => setState("error"))
  }, [token, status])

  const handleResend = async () => {
    if (!resendEmail) {
      toast.error("Please enter your email address.")
      return
    }
    setResending(true)
    try {
      await fetchApiJson("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: resendEmail }),
      })
      toast.success("Verification email sent! Check your inbox.")
    } catch (err: any) {
      toast.error(err.message || "Failed to resend. Please try again.")
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary mb-4">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Email Verification</h2>
        </div>

        {state === "loading" && (
          <div className="text-center space-y-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Verifying your email…</p>
          </div>
        )}

        {state === "success" && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-lg text-foreground">Email verified! 🎉</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your account is now active. You can sign in to SpendSense.
              </p>
            </div>
            <Link href="/login">
              <Button className="w-full mt-2">Sign In</Button>
            </Link>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/20">
                <XCircle className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <p className="font-semibold text-lg text-foreground">Invalid or expired link</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This verification link has expired or was already used. Request a new one below.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail className="h-4 w-4 text-primary" />
                Resend verification email
              </div>
              <input
                type="email"
                placeholder="your@email.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button onClick={handleResend} disabled={resending} className="w-full">
                {resending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {resending ? "Sending…" : "Resend Verification Email"}
              </Button>
            </div>

            <Link href="/login" className="flex justify-center text-sm text-muted-foreground hover:text-foreground transition-colors">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  )
}
