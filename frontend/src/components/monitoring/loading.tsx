'use client'

import { Skeleton } from '@/components/ui/skeleton'

export default function MonitoringLoading() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Quick Stats Loading */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg p-4 border shadow-sm">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>

      {/* Charts Loading */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg p-6 border shadow-sm">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        ))}
      </div>

      {/* Table Loading */}
      <div className="bg-card rounded-lg p-6 border shadow-sm">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}