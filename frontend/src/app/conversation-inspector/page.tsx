'use client'

import { useSearchParams } from 'next/navigation'
import { MessageInspector } from '@/components/conversation/MessageInspector'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function ConversationInspectorPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const sessionId = searchParams.get('session')

    if (!sessionId) {
        return (
            <div className="container mx-auto py-8">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-red-600">Error</h1>
                    <p className="text-gray-600 mt-2">No session ID provided</p>
                    <Button
                        onClick={() => router.back()}
                        className="mt-4"
                    >
                        Go Back
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-8">
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold">Conversation Inspector</h1>
                    <p className="text-muted-foreground">
                        View and manage conversation messages
                    </p>
                </div>

                <MessageInspector
                    sessionId={sessionId}
                    onMessagesDeleted={() => {
                        // Optionally refresh the chat view
                        console.log('Messages deleted')
                    }}
                />
            </div>
        </div>
    )
}