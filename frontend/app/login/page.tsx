"use client"

import { useState } from "react"
import Link from "next/link"
import { Sparkles, Loader2 } from "lucide-react"
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

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const { login } = useAuth()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError("Please fill in all fields.")
      return
    }
    setLoading(true)
    setError("")

    try {
      const data = await fetchApiJson<LoginResponse>("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })

      console.log("[Login] Success:", data.user)
      login(data.access_token, data.user)
      toast.success(`Welcome back, ${data.user.name}!`)
    } catch (err: any) {
      const msg = err.message || "Invalid email or password."
      console.error("[Login] Error:", msg)
      setError(msg)
      toast.error("Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary mb-4">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Sign in to AI EXPENSE ANALYSER
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Analyze your expenses with the power of Explainable AI
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin} noValidate>
          {error && (
            <div
              id="login-error"
              className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30"
            >
              {error}
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                placeholder="••••••••"
              />
            </div>
          </div>

          <Button
            id="login-submit"
            type="submit"
            className="w-full"
            disabled={loading}
          >
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
