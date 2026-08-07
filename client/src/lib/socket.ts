import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

const socketUrl = import.meta.env.VITE_SOCKET_URL || '/'
const socketPath = import.meta.env.VITE_SOCKET_PATH || '/socket.io'

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('token')
    socket = io(socketUrl, {
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
