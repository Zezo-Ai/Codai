'use client'

import { useState, useCallback } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { Camera, Download, Maximize2, X, Copy, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

interface ScreenshotViewerProps {
    screenshot: {
        data: string;
        timestamp?: string;
    };
}

export function ScreenshotViewer({ screenshot }: ScreenshotViewerProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    const handleDownload = useCallback(() => {
        const link = document.createElement('a')
        link.href = screenshot.data
        link.download = `screenshot-${new Date().toISOString()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleCopy = useCallback(async () => {
        setIsLoading(true)
        try {
            const response = await fetch(screenshot.data)
            const blob = await response.blob()
            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ])
            toast({
                title: "Success",
                description: "Screenshot copied to clipboard",
                duration: 3000
            })
        } catch (err) {
            console.error('Failed to copy screenshot:', err)
            toast({
                title: "Error",
                description: "Failed to copy screenshot",
                variant: "destructive",
                duration: 5000
            })
        } finally {
            setIsLoading(false)
        }
    }, [screenshot.data, toast])

    return (
        <div className="screenshot-result border rounded-lg p-3 bg-gray-50">
            <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-medium flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Screenshot
                    {screenshot.timestamp && (
                        <span className="text-xs text-gray-500">
                            ({new Date(screenshot.timestamp).toLocaleTimeString()})
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 px-2 text-xs"
                        onClick={() => setIsExpanded(true)}
                    >
                        <Maximize2 className="h-3 w-3 mr-1" />
                        View Full
                    </Button>
                    <Button 
                        size="sm" 
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        onClick={handleCopy}
                        disabled={isLoading}
                    >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                    </Button>
                    <Button 
                        size="sm" 
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        onClick={handleDownload}
                    >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                    </Button>
                </div>
            </div>
            
            <div 
                className="screenshot-preview cursor-pointer" 
                onClick={() => setIsExpanded(true)}
            >
                <div className="relative border rounded overflow-hidden bg-white">
                    <img 
                        src={screenshot.data} 
                        alt="Screenshot preview"
                        className="max-h-[300px] w-auto mx-auto"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                        Click to view full size
                    </div>
                </div>
            </div>

            <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
                <DialogContent className="max-w-[90vw] max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex justify-between items-center">
                            <span>Screenshot View</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => setIsExpanded(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </DialogTitle>
                    </DialogHeader>
                    <div className="relative flex-1 overflow-auto p-1">
                        <div className="relative min-h-0 rounded border bg-white">
                            <img 
                                src={screenshot.data} 
                                alt="Screenshot full view"
                                className="max-w-full h-auto mx-auto"
                                onError={() => {
                                    toast({
                                        title: "Error",
                                        description: "Failed to load screenshot",
                                        variant: "destructive",
                                        duration: 5000
                                    })
                                }}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button 
                            variant="outline"
                            onClick={handleCopy}
                            disabled={isLoading}
                            className="h-8"
                        >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy to Clipboard
                        </Button>
                        <Button 
                            variant="outline"
                            onClick={handleDownload}
                            className="h-8"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}