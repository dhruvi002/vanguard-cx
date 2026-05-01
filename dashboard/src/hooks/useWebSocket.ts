import { useEffect, useRef, useCallback } from 'react'
import type { WSMessage } from '../types'

function getWsUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL as string
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws`
}

type Handler = (msg: WSMessage) => void

export function useWebSocket(onMessage: Handler) {
  const ws = useRef<WebSocket | null>(null)
  const handlerRef = useRef<Handler>(onMessage)
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retries = useRef(0)

  handlerRef.current = onMessage

  const connect = useCallback(() => {
    try {
      const socket = new WebSocket(getWsUrl())
      ws.current = socket

      socket.onopen = () => { retries.current = 0 }

      socket.onmessage = (event) => {
        try {
          const lines = (event.data as string).split('\n').filter(Boolean)
          for (const line of lines) {
            const msg: WSMessage = JSON.parse(line)
            handlerRef.current(msg)
          }
        } catch { /* ignore parse errors */ }
      }

      socket.onclose = () => {
        const delay = Math.min(1000 * 2 ** retries.current, 30000)
        retries.current++
        retryRef.current = setTimeout(connect, delay)
      }

      socket.onerror = () => socket.close()
    } catch {
      const delay = Math.min(1000 * 2 ** retries.current, 30000)
      retries.current++
      retryRef.current = setTimeout(connect, delay)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(retryRef.current)
      ws.current?.close()
    }
  }, [connect])
}
