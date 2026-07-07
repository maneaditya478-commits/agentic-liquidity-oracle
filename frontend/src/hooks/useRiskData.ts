import { useState, useEffect, useCallback } from 'react'
import { getRiskHistory, analyzeRisk } from '../api/client'
import { useStore } from '../store/useStore'
import type { RiskPrediction, AnalyzeRequest, AnalyzeResponse } from '../types'

interface UseRiskDataReturn {
  riskHistory: RiskPrediction[]
  latestRisk: RiskPrediction | null
  loading: boolean
  error: string | null
  triggerAnalysis: (metrics: AnalyzeRequest) => Promise<AnalyzeResponse | null>
}

export function useRiskData(): UseRiskDataReturn {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { riskHistory, setRiskHistory } = useStore()

  const fetchHistory = useCallback(async () => {
    try {
      setError(null)
      const history = await getRiskHistory(50)
      setRiskHistory(history)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch risk history'
      setError(msg)
      console.warn('[useRiskData] API error:', msg)
    } finally {
      setLoading(false)
    }
  }, [setRiskHistory])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const triggerAnalysis = useCallback(
    async (metrics: AnalyzeRequest): Promise<AnalyzeResponse | null> => {
      try {
        setLoading(true)
        const result = await analyzeRisk(metrics)
        // Refetch history to include new analysis
        await fetchHistory()
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Analysis failed'
        setError(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [fetchHistory]
  )

  const latestRisk = riskHistory.length > 0 ? riskHistory[0] : null

  return {
    riskHistory,
    latestRisk,
    loading,
    error,
    triggerAnalysis,
  }
}
