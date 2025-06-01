'use client'

import { FC } from 'react'
import { useMonitoringStore } from '@/store/monitoring'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const RecentErrorsList: FC = () => {
  const { recentErrors, isLoading } = useMonitoringStore()

  if (isLoading) {
    return <Skeleton className="h-[400px]" />
  }

  return (
    <div className="relative overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Time</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Component</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recentErrors.map((error, index) => (
            <TableRow key={`${error.timestamp}-${error.message}-${index}`}>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(error.timestamp).toLocaleString()}
              </TableCell>
              <TableCell>{error.message}</TableCell>
              <TableCell className="text-sm">{error.component}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}