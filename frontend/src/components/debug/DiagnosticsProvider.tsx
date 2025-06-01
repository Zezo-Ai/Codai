'use client'

import { ReactNode } from 'react'
import { DiagnosticCollector } from './DiagnosticCollector'
import useDiagnostics from '@/hooks/useDiagnostics'

interface DiagnosticsProviderProps {
  children: ReactNode
}

/**
 * Wraps application with diagnostic tools when appropriate
 */
export function DiagnosticsProvider({ children }: DiagnosticsProviderProps) {
  const { isVisible } = useDiagnostics()
  
  return (
    <>
      {children}
      {isVisible && <DiagnosticCollector />}
    </>
  )
}

export default DiagnosticsProvider