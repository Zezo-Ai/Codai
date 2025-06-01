'use client'

import { RecoveryDashboard } from '@/components/analytics/RecoveryDashboard'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function AnalyticsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-6">
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to Chat
            </button>
          </div>

          <RecoveryDashboard />
        </div>
      </div>
    </div>
  )
}