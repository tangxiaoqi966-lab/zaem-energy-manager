import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth'
import { getSocketPath, getSocketUrl } from './runtime-config'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    const token = useAuthStore.getState().token
    socket = io(getSocketUrl(), {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      path: getSocketPath(),
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
