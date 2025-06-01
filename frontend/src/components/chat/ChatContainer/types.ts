export interface TrackEventParams {
  action: string
  metadata?: Record<string, any>
  sessionId?: string
  category?: string
}

export interface RecoveryParams {
  sessionId: string
  source: 'indexeddb'
  context: string
}