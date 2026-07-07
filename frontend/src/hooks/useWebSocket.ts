import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import type { WebSocketMessage } from '../types'

const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.hostname}:8000`
}

const BASE_WS_URL = getWsUrl()
const MAX_RETRIES = 10
const BASE_DELAY = 1000

interface UseWebSocketReturn {
  isConnected: boolean
  lastMessage: WebSocketMessage | null
  sendMessage: (msg: object) => void
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const {
    token,
    isConnected,
    lastAlert,
    setConnected,
    appendActivity,
    setTreasuryStatus,
    appendTransaction,
    setAgentRunning,
  } = useStore()

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data as string)
        appendActivity(msg)

        switch (msg.type) {
          case 'RISK_UPDATE':
            if (msg.payload && typeof msg.payload === 'object') {
              // Update treasury status if provided in payload
              const payload = msg.payload as Record<string, unknown>
              if (payload.treasury_status) {
                setTreasuryStatus(payload.treasury_status as Parameters<typeof setTreasuryStatus>[0])
              }
            }
            break
          case 'ACTION_TRIGGERED':
            // Flash alert for triggered actions
            break
          case 'TX_CONFIRMED':
            if (msg.payload && typeof msg.payload === 'object') {
              const payload = msg.payload as Record<string, unknown>
              if (payload.transaction) {
                appendTransaction(payload.transaction as Parameters<typeof appendTransaction>[0])
              }
            }
            break
          case 'AGENT_CYCLE':
            setAgentRunning(true)
            break
        }
      } catch (e) {
        console.warn('[WS] Failed to parse message:', e)
      }
    },
    [appendActivity, setTreasuryStatus, appendTransaction, setAgentRunning]
  )

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const url = token
      ? `${BASE_WS_URL}/ws/live?token=${token}`
      : `${BASE_WS_URL}/ws/live`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        retriesRef.current = 0
        setConnected(true)
        console.info('[WS] Connected to Treasury Oracle')
      }

      ws.onmessage = handleMessage

      ws.onclose = (evt) => {
        if (!mountedRef.current) return
        setConnected(false)
        console.warn('[WS] Disconnected:', evt.code, evt.reason)

        if (retriesRef.current < MAX_RETRIES) {
          const delay = Math.min(
            BASE_DELAY * Math.pow(2, retriesRef.current),
            30000
          )
          retriesRef.current++
          reconnectTimerRef.current = setTimeout(connect, delay)
        }
      }

      ws.onerror = (err) => {
        console.error('[WS] Error:', err)
        ws.close()
      }
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err)
    }
  }, [token, handleMessage, setConnected])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted')
      }
    }
  }, [connect])

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    } else {
      console.warn('[WS] Cannot send — not connected')
    }
  }, [])

  return {
    isConnected,
    lastMessage: lastAlert,
    sendMessage,
  }
}
