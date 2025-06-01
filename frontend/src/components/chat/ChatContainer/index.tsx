'use client'

import { ErrorProvider } from '../../error/ErrorProvider'
import { ChatContainerContent } from './Content'

export function ChatContainer() {
  return (
    <ErrorProvider>
      <ChatContainerContent />
    </ErrorProvider>
  )
}