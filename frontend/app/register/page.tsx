"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Sparkles, Loader2, Eye, EyeOff, Mail, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fetchApiJson } from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type SignupResponse = { id: number; name: string; email: string }
type StrengthLevel = { label: string; color: string; width: string; score: number }

function getPasswordStrength(pwd: string): StrengthLevel {
  let score = 0
  if (pwd.length >= 8) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[a-z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  if (score <= 1) return { label: "Weak", color: "bg-red-500", width: "w-1/5", score }
  if (score === 2) return { label: "Fair", color: "bg-orange-500", width: "w-2/5", score }
  if (score === 3) return { label: "Medium", color: "bg-yellow-500", width: "w-3/5", score }
  if (score === 4) return { label: "Strong", color: "bg-emerald-500", width: "w-4/5", score }
  return { label: "Very Strong", color: "bg-emerald-400", width: "w-full", score }
}

function validatePassword(pwd: string): string[] {
  const issues: string[] = []
  if (pwd.length < 8) issues.push("At least 8 characters")
  if (!/[A-Z]/.test(pwd)) issues.push("One uppercase letter")
  if (!/[a-z]/.test(pwd)) issues.push("One lowercase letter")
  if (!/\d/.test(pwd)) issues.push("One number")
  if (!/[^A-Za-z0-9]/.test(pwd)) issues.push("One special character")
  return issues
}

export default function RegisterPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [registered, setRegistered] = useState(false)
  const [resending, setResending] = useState(false)

  const strength = useMemo(() => getPasswordStrength(password), [password])
  const pwdIssues = useMemo(() => validatePassword(password), [password])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !password) { setError("Please fill in all fields."); return }
    if (pwdIssues.length > 0) { setError(`Password requirements not met: ${pwdIssues.join(", ")}.`); return }
    setLoading(true)
    setError("")
    try {
      await fetchApiJson<SignupResponse>("/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      })
      setRegistered(true)
    } catch (err: any) {
      setError(err.message || "Registration failed. Email may already be in use.")
      toast.error("Registration failed")
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await fetchApiJson("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      toast.success("Verification email resent! Check your inbox.")
    } catch (err: any) {
      toast.error(err.message || "Failed to resend. Please wait a moment.")
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
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Create an Account</h2>
          <p className="mt-2 text-sm text-muted-foreground">Start your financial clarity journey with SpendSense</p>
        </div>

        {registered ? (
          /* ── Check inbox state ── */
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
              <Mail className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-lg text-foreground">Check your inbox! 📬</p>
              <p className="text-sm text-muted-foreground mt-1">
                We sent a verification link to <strong className="text-foreground">{email}</strong>.
                Click the link in the email to activate your account.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">The link expires in 24 hours.</p>
            <Button variant="outline" size="sm" onClick={handleResend} disabled={resending} className="w-full">
              {resending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-2 h-3.5 w-3.5" />}
              {resending ? "Sending…" : "Resend verification email"}
            </Button>
            <Link href="/login" className="inline-block text-sm text-primary hover:text-primary/80 font-medium">
              Back to sign in
            </Link>
          </div>
        ) : (
          /* ── Registration form ── */
          <form className="mt-8 space-y-6" onSubmit={handleRegister} noValidate>
            {error && (
              <div id="register-error" className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" name="name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="John Doe" />
              </div>
              <div>
                <Label htmlFor="email">Email address</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" placeholder="you@example.com" />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {password.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Password strength</span>
                      <span className={cn("text-xs font-semibold", strength.score <= 2 ? "text-red-400" : strength.score === 3 ? "text-yellow-400" : "text-emerald-400")}>
                        {strength.label}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-300", strength.color, strength.width)} />
                    </div>
                    {pwdIssues.length > 0 && (
                      <ul className="space-y-1 mt-2">
                        {pwdIssues.map((issue) => (
                          <li key={issue} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Button id="register-submit" type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? "Creating account..." : "Create Account"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-primary hover:text-primary/80">
                Sign in instead
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
