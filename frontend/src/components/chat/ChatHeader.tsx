'use client'

import { SystemStatus } from '../system/SystemStatus'

interface ChatHeaderProps {
  onSettingsClick?: () => void
  onHelpClick?: () => void
}

export function ChatHeader({ onSettingsClick, onHelpClick }: ChatHeaderProps) {
  return <SystemStatus />
}