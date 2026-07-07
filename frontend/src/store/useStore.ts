import { create } from 'zustand'
import type {
  User,
  TreasuryStatus,
  RiskPrediction,
  BlockchainTransaction,
  AuditRecord,
  WebSocketMessage,
} from '../types'

interface StoreState {
  // Auth
  user: User | null
  token: string | null

  // Treasury Data
  treasuryStatus: TreasuryStatus | null
  riskHistory: RiskPrediction[]
  transactions: BlockchainTransaction[]
  auditLogs: AuditRecord[]

  // WebSocket / Live
  isConnected: boolean
  lastAlert: WebSocketMessage | null
  isAgentRunning: boolean
  activityFeed: WebSocketMessage[]

  // UI State
  isSidebarOpen: boolean
  globalLoading: boolean

  // Actions
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  logout: () => void
  setTreasuryStatus: (status: TreasuryStatus) => void
  appendTransaction: (tx: BlockchainTransaction) => void
  setRiskHistory: (history: RiskPrediction[]) => void
  setAuditLogs: (logs: AuditRecord[]) => void
  setConnected: (connected: boolean) => void
  setLastAlert: (msg: WebSocketMessage) => void
  setAgentRunning: (running: boolean) => void
  appendActivity: (msg: WebSocketMessage) => void
  setSidebarOpen: (open: boolean) => void
  setGlobalLoading: (loading: boolean) => void
}

export const useStore = create<StoreState>((set) => ({
  // Initial State
  user: (() => {
    try {
      const stored = localStorage.getItem('treasury_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })(),
  token: localStorage.getItem('treasury_token'),

  treasuryStatus: null,
  riskHistory: [],
  transactions: [],
  auditLogs: [],

  isConnected: false,
  lastAlert: null,
  isAgentRunning: true,
  activityFeed: [],

  isSidebarOpen: true,
  globalLoading: false,

  // Auth Actions
  setUser: (user) => {
    set({ user })
    if (user) {
      localStorage.setItem('treasury_user', JSON.stringify(user))
    } else {
      localStorage.removeItem('treasury_user')
    }
  },

  setToken: (token) => {
    set({ token })
    if (token) {
      localStorage.setItem('treasury_token', token)
    } else {
      localStorage.removeItem('treasury_token')
    }
  },

  logout: () => {
    localStorage.removeItem('treasury_token')
    localStorage.removeItem('treasury_user')
    set({ user: null, token: null, treasuryStatus: null })
  },

  // Data Actions
  setTreasuryStatus: (status) => set({ treasuryStatus: status }),

  appendTransaction: (tx) =>
    set((state) => ({
      transactions: [tx, ...state.transactions].slice(0, 50),
    })),

  setRiskHistory: (history) => set({ riskHistory: history }),

  setAuditLogs: (logs) => set({ auditLogs: logs }),

  // WebSocket Actions
  setConnected: (connected) => set({ isConnected: connected }),

  setLastAlert: (msg) => set({ lastAlert: msg }),

  setAgentRunning: (running) => set({ isAgentRunning: running }),

  appendActivity: (msg) =>
    set((state) => ({
      activityFeed: [msg, ...state.activityFeed].slice(0, 20),
      lastAlert: msg,
    })),

  // UI Actions
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setGlobalLoading: (loading) => set({ globalLoading: loading }),
}))
