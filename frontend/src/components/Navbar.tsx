import { motion, AnimatePresence } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import {
  Shield,
  LayoutDashboard,
  Activity,
  Link2,
  FileText,
  Wifi,
  WifiOff,
  Bot,
  ChevronDown,
  LogOut,
  User,
  Bell,
} from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../store/useStore'
import clsx from 'clsx'

const navLinks = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/risk', label: 'Risk Analytics', icon: Activity },
  { path: '/blockchain', label: 'Blockchain', icon: Link2 },
  { path: '/audit', label: 'Audit Logs', icon: FileText },
]

export default function Navbar() {
  const location = useLocation()
  const { user, isConnected, isAgentRunning, logout, lastAlert } = useStore()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [hasNewAlert, setHasNewAlert] = useState(false)

  // Detect demo mode — token ends with .demo-signature (not a real JWT)
  const token = localStorage.getItem('treasury_token') ?? ''
  const isDemoMode = token.endsWith('.demo-signature')

  return (
    <>
      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500/20 border-b border-amber-500/30 backdrop-blur-md py-1.5 px-4 text-center text-xs text-amber-300 font-medium flex items-center justify-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Demo Mode — Backend offline. Live data unavailable. Start the backend to connect.
          <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="ml-2 underline opacity-70 hover:opacity-100">API Docs ↗</a>
        </div>
      )}
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="glass-nav fixed top-0 left-0 right-0 z-50 h-16"
    >
      <div className="flex items-center justify-between h-full px-6 max-w-screen-2xl mx-auto">
        {/* ─── Logo ─── */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-success pulse-glow-green border-2 border-[#050914]" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="gradient-text font-bold text-lg tracking-tight">
              Treasury Oracle
            </span>
            <span className="text-[10px] text-white/30 font-medium tracking-widest uppercase">
              AI Risk Platform
            </span>
          </div>
        </Link>

        {/* ─── Nav Links ─── */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className={clsx(
                  'relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'text-white bg-white/08'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/04'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/10 border border-indigo-500/30"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            )
          })}
        </div>

        {/* ─── Right Section ─── */}
        <div className="flex items-center gap-3">
          {/* Agent Status Pill */}
          <div
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border',
              isAgentRunning
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-white/04 border-white/08 text-white/40'
            )}
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isAgentRunning ? 'Agent Active' : 'Agent Idle'}
            </span>
            {isAgentRunning && (
              <span className="w-2 h-2 rounded-full bg-success pulse-dot" />
            )}
          </div>

          {/* WebSocket Status */}
          <div
            title={isConnected ? 'Live feed connected' : 'Disconnected'}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all',
              isConnected
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                : 'bg-white/04 border-white/08 text-white/30'
            )}
          >
            {isConnected ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{isConnected ? 'Live' : 'Offline'}</span>
          </div>

          {/* Alerts Bell */}
          <button
            className="relative p-2 rounded-xl bg-white/04 border border-white/08 text-white/50 hover:text-white hover:bg-white/08 transition-all"
            onClick={() => setHasNewAlert(false)}
          >
            <Bell className="w-4 h-4" />
            {hasNewAlert && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger pulse-glow-red" />
            )}
          </button>

          {/* User Dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/04 border border-white/08 hover:bg-white/08 transition-all group"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                {user?.username?.[0]?.toUpperCase() ?? 'A'}
              </div>
              <div className="hidden sm:flex flex-col items-start leading-none">
                <span className="text-sm font-medium text-white/90">
                  {user?.username ?? 'Admin'}
                </span>
                <span className="text-[10px] text-white/40 capitalize">
                  {user?.role ?? 'administrator'}
                </span>
              </div>
              <ChevronDown
                className={clsx(
                  'w-3.5 h-3.5 text-white/40 transition-transform',
                  userMenuOpen && 'rotate-180'
                )}
              />
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-48 glass-card p-1.5 z-50"
                >
                  <Link
                    to="/profile"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/06 transition-all"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <User className="w-4 h-4" />
                    Profile
                  </Link>
                  <div className="h-px bg-white/06 my-1" />
                  <button
                    onClick={() => {
                      logout()
                      setUserMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-danger/80 hover:text-danger hover:bg-danger/08 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.nav>
    </>
  )
}
