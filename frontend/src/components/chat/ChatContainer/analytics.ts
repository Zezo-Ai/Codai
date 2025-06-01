import { analytics } from '@/lib/analytics'
import { recoveryAnalytics } from '@/lib/recoveryAnalytics'
import { TrackEventParams, RecoveryParams } from './types'

export const trackEvent = (params: TrackEventParams, features: any) => {
  const { action, metadata, sessionId, category } = params
  if (features.analytics?.isEnabled) {
    analytics.trackEvent('chat', action, {
      sessionId,
      category,
      ...metadata
    })
  }
}

export const trackRecovery = {
  attempt: async ({ sessionId, source, context }: RecoveryParams) => {
    return await recoveryAnalytics.trackRecoveryAttempt(sessionId, source, context)
  },

  success: (sessionId: string, source: string, startTime: number, messages: any[], context: string) => {
    recoveryAnalytics.trackRecoverySuccess(sessionId, source, startTime, messages, context)
  },

  failure: (sessionId: string, source: string, error: Error, context: string) => {
    recoveryAnalytics.trackRecoveryFailure(sessionId, source, error, context)
  }
}