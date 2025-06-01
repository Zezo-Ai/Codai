import { Metadata } from 'next'
import { Suspense } from 'react'
import Loading from '@/components/monitoring/loading'

export const metadata: Metadata = {
  title: 'System Monitoring | CodaiApp',
  description: 'System monitoring and logging dashboard'
}

export default function MonitoringLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <main className="flex-1 overflow-y-auto">
        <Suspense fallback={<Loading />}>
          {children}
        </Suspense>
      </main>
    </div>
  )
}