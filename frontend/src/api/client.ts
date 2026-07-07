import axios from 'axios'
import type {
  AuthTokens,
  TreasuryStatus,
  AnalyzeRequest,
  AnalyzeResponse,
  RiskPrediction,
  AuditRecord,
  BlockchainTransaction,
  ActionType,
} from '../types'

// ─── Axios Instance ────────────────────────────────────────────────────────

const getBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  return `${window.location.protocol}//${window.location.hostname}:8000`
}

const apiClient = axios.create({
  baseURL: getBaseUrl(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request Interceptor — Attach Bearer Token ──────────────────────────────

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('treasury_token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ─── Response Interceptor — Handle 401 ─────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('treasury_token')
      localStorage.removeItem('treasury_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ─── Typed API Functions ────────────────────────────────────────────────────

export const login = async (
  username: string,
  password: string
): Promise<AuthTokens> => {
  const formData = new FormData()
  formData.append('username', username)
  formData.append('password', password)
  const response = await apiClient.post<AuthTokens>('/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return response.data
}

export const getTreasuryStatus = async (): Promise<TreasuryStatus> => {
  const response = await apiClient.get<TreasuryStatus>('/treasury/status')
  return response.data
}

export const analyzeRisk = async (
  data: AnalyzeRequest
): Promise<AnalyzeResponse> => {
  const response = await apiClient.post<AnalyzeResponse>('/risk/analyze', data)
  return response.data
}

export const getRiskHistory = async (
  limit = 50
): Promise<RiskPrediction[]> => {
  const response = await apiClient.get<RiskPrediction[]>('/risk/history', {
    params: { limit },
  })
  return response.data
}

export const getAuditLogs = async (
  page = 1,
  size = 20
): Promise<{ items: AuditRecord[]; total: number }> => {
  const response = await apiClient.get<{ items: AuditRecord[]; total: number }>(
    '/audit/logs',
    { params: { page, size } }
  )
  return response.data
}

export const getTransactionHistory = async (
  limit = 20
): Promise<BlockchainTransaction[]> => {
  const response = await apiClient.get<BlockchainTransaction[]>(
    '/blockchain/transactions',
    { params: { limit } }
  )
  return response.data
}

export const executeDecision = async (
  action: ActionType,
  metrics: Record<string, number>
): Promise<BlockchainTransaction> => {
  const response = await apiClient.post<BlockchainTransaction>(
    '/blockchain/execute',
    { action, metrics }
  )
  return response.data
}

export const getHealthStatus = async (): Promise<Record<string, unknown>> => {
  const response = await apiClient.get<Record<string, unknown>>('/health')
  return response.data
}

export default apiClient
