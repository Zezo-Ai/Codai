'use client'

import { useState, useEffect } from 'react'
import { useTokenMetrics } from '@/hooks/useTokenMetrics'

import { CurrentSession } from './components/CurrentSession'
import { UsageChart } from './components/UsageChart'
import { CachePerformance } from './components/CachePerformance'
import { RecentActivity } from './components/RecentActivity'
import { LoadingState } from './components/LoadingState'
import { ErrorState } from './components/ErrorState'
import { EmptyState } from './components/EmptyState'

import { BarChart2 } from 'lucide-react'

export function TokenMetrics() {
  const [showDetails, setShowDetails] = useState(false)
  const { metrics, refreshMetrics, isLoading, error } = useTokenMetrics()

  const hasData = metrics.currentSession.inputTokens > 0 || 
                  metrics.currentSession.outputTokens > 0 ||
                  metrics.history.length > 0

  const closeDetails = () => {
    setShowDetails(false);
  };

  useEffect(() => {
    if (!showDetails) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.token-metrics-popup')) {
        closeDetails();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showDetails]);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => {
          if (!showDetails) {
            refreshMetrics();
          }
          setShowDetails(!showDetails);
        }}
        className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
        title="Token Usage"
      >
        <BarChart2 className="h-5 w-5 text-gray-600" />
      </button>

      {showDetails && (
        <div 
          className="token-metrics-popup absolute top-full mt-2 right-0 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={refreshMetrics} />
          ) : !hasData ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              <CurrentSession 
                inputTokens={metrics.currentSession.inputTokens}
                outputTokens={metrics.currentSession.outputTokens}
              />
              <div className="border-t border-gray-100 pt-3">
                <UsageChart history={metrics.history} />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <CachePerformance 
                  hitRate={metrics.cache.hitRate}
                  readTokens={metrics.cache.readTokens}
                />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <RecentActivity history={metrics.history} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}