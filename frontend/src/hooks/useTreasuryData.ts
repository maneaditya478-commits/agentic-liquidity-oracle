import { useState, useEffect, useCallback, useRef } from 'react'
import { getTreasuryStatus } from '../api/client'
import { useStore } from '../store/useStore'
import type { TreasuryStatus } from '../types'

const POLL_INTERVAL = 30_000 // 30 seconds

interface UseTreasuryDataReturn {
  data: TreasuryStatus | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useTreasuryData(): UseTreasuryDataReturn {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { treasuryStatus, setTreasuryStatus } = useStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const status = await getTreasuryStatus()
      if (mountedRef.current) {
        setTreasuryStatus(status)
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch treasury status'
        setError(msg)
        console.warn('[useTreasuryData] API error (using mock data):', msg)
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [setTreasuryStatus])

  useEffect(() => {
    mountedRef.current = true
    fetchData()

    intervalRef.current = setInterval(fetchData, POLL_INTERVAL)

    return () => {
      mountedRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [fetchData])

  return {
    data: treasuryStatus,
    loading,
    error,
    refetch: fetchData,
  }
}
