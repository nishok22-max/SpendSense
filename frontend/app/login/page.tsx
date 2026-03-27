"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Sparkles, Loader2, Eye, EyeOff, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth-provider"
import { fetchApiJson } from "@/lib/api"
import { toast } from "sonner"

type LoginResponse = {
  access_token: string
  token_type: string
  user: { id: number; name: string; email: string }
}

function LoginContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [unverified, setUnverified] = useState(false)
  const [resending, setResending] = useState(false)
  const { login } = useAuth()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get("verified") === "1") {
      toast.success("Email verified! You can now sign in. 🎉")
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError("Please fill in all fields."); return }
    setLoading(true)
    setError("")
    setUnverified(false)

    try {
      const data = await fetchApiJson<LoginResponse>("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
      login(data.access_token, data.user)
      toast.success(`Welcome back, ${data.user.name}!`)
    } catch (err: any) {
      if (err.message === "EMAIL_NOT_VERIFIED") {
        setUnverified(true)
        setError("Please verify your email before signing in.")
      } else {
        setError(err.message || "Invalid email or password.")
        toast.error("Login failed")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) { toast.error("Enter your email above first."); return }
    setResending(true)
    try {
      await fetchApiJson("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      toast.success("Verification email sent! Check your inbox.")
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
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Sign in to SpendSense</h2>
          <p className="mt-2 text-sm text-muted-foreground">Analyze your expenses with the power of AI</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin} noValidate>
          {error && (
            <div id="login-error" className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30 space-y-2">
              <p>{error}</p>
              {unverified && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {resending ? "Sending…" : "Resend verification email"}
                </button>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:text-primary/80 font-medium">
                  Forgot password?
                </Link>
              </div>
              <div className="relative mt-1">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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
            </div>
          </div>

          <Button id="login-submit" type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? "Signing in..." : "Sign In"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-semibold text-primary hover:text-primary/80">
              Register here
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
