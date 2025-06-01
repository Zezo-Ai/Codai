'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// Dynamically import components with no SSR
const LoggingDashboard = dynamic(
  () => import('@/components/monitoring/LoggingDashboard').then(mod => mod.LoggingDashboard),
  { ssr: false }
)

const LogViewer = dynamic(
  () => import('@/components/monitoring/LogViewer').then(mod => mod.LogViewer),
  { ssr: false }
)

export default function MonitoringPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="logs">Log Files</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard">
          <Suspense fallback={<div>Loading dashboard...</div>}>
            <LoggingDashboard />
          </Suspense>
        </TabsContent>
        
        <TabsContent value="logs">
          <Suspense fallback={<div>Loading logs...</div>}>
            <LogViewer />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}