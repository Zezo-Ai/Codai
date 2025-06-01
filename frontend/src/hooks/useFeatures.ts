'use client'

import { useState, useEffect } from 'react'
import { featureFlags } from '@/lib/featureFlags'

export function useFeatures() {
  const [features, setFeatures] = useState({
    chatReset: {
      isAvailable: false,
      error: undefined as string | undefined
    },
    analytics: {
      isEnabled: false,
      error: undefined as string | undefined
    },
    extendedThinking: {
      isEnabled: false,
      error: undefined as string | undefined
    }
  })

  useEffect(() => {
    const checkFeatures = async () => {
      // Check chatReset feature
      await featureFlags.checkFeatureAvailability('chatReset')
      const chatResetStatus = featureFlags.getFeatureStatus('chatReset')

      // Check analytics feature
      await featureFlags.checkFeatureAvailability('analytics')
      const analyticsStatus = featureFlags.getFeatureStatus('analytics')
      
      // Check extended thinking feature
      await featureFlags.checkFeatureAvailability('extendedThinking')
      const extendedThinkingStatus = featureFlags.getFeatureStatus('extendedThinking')

      setFeatures(prev => ({
        ...prev,
        chatReset: {
          isAvailable: chatResetStatus.isAvailable,
          error: chatResetStatus.error
        },
        analytics: {
          isEnabled: analyticsStatus.isAvailable,
          error: analyticsStatus.error
        },
        extendedThinking: {
          isEnabled: extendedThinkingStatus.isAvailable,
          error: extendedThinkingStatus.error
        }
      }))
    }

    checkFeatures()
    
    // Check features every 5 minutes
    const interval = setInterval(checkFeatures, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return features
}