const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "")

export function getApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`API paths must start with "/". Received: ${path}`)
  }
  if (configuredApiBaseUrl) {
    return `${configuredApiBaseUrl}${path}`
  }
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location
    return `${protocol}//${hostname}:8000${path}`
  }
  return `http://127.0.0.1:8000${path}`
}

export async function fetchApiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)

  // Always send JSON content type unless it's multipart (FormData)
  if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  // Attach JWT token if available
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token")
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }
  }

  const response = await fetch(getApiUrl(path), {
    ...init,
    headers,
  })

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`
    try {
      const body = await response.json()
      if (body?.detail) errorDetail = body.detail
      else if (body?.message) errorDetail = body.message
    } catch {
      // ignore parse error
    }
    throw new Error(errorDetail)
  }

  return response.json() as Promise<T>
}
