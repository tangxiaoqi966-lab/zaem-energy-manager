import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth'

let socket: Socket | null = null

const socketPath = import.meta.env.VITE_SOCKET_PATH || '/socket.io'

function resolveSocketUrl(): string {
  const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL
  if (explicitSocketUrl) {
    return explicitSocketUrl
  }

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (apiBaseUrl) {
    try {
      const apiUrl = new URL(apiBaseUrl, window.location.origin)
      if (/^https?:\/\//i.test(apiBaseUrl)) {
        return apiUrl.origin
      }
    } catch {
    }
  }

  return '/'
}

export function getSocket(): Socket {
  if (!socket) {
    const token = useAuthStore.getState().token
    socket = io(resolveSocketUrl(), {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      path: socketPath,
    })
  }
  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
