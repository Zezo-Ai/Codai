'use client'

import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface InspectorLinkProps {
  sessionId: string
  disabled?: boolean
}

export function InspectorLink({ sessionId, disabled }: InspectorLinkProps) {
  const router = useRouter()

  const handleClick = () => {
    router.push(`/conversation-inspector?session=${sessionId}`)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      disabled={disabled}
      onClick={handleClick}
    >
      <Eye className="h-4 w-4 mr-2" />
      Message Inspector
    </Button>
  )
}