"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Bell, Search, ChevronDown, LogOut } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/components/auth-provider"

export function TopNav() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { logout } = useAuth()
  
  const timeFilter = searchParams.get("timeFilter") || "Last 30 days"

  const handleTimeFilter = (filter: string) => {
    const params = new URLSearchParams(searchParams)
    params.set("timeFilter", filter)
    router.replace(`${pathname}?${params.toString()}`)
    toast.success(`Timeframe changed to ${filter}!`)
  }

  const handleNotification = () => {
    toast("No new notifications", { description: "You are all caught up!" })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md">
      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search transactions, categories..."
          className="h-10 w-full border-input bg-input pl-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNotification}
          className="relative text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
        </Button>

        {/* Time filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="gap-2 border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              {timeFilter}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="border-border bg-popover text-popover-foreground"
          >
            <DropdownMenuItem onClick={() => handleTimeFilter("Last 7 days")}>Last 7 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleTimeFilter("Last 30 days")}>Last 30 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleTimeFilter("Last 90 days")}>Last 90 days</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleTimeFilter("This year")}>This year</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleTimeFilter("All time")}>All time</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          title="Logout"
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
