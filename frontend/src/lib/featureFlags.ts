import { notifications } from './notifications';
import { analytics } from './analytics';

type FeatureStatus = {
  isAvailable: boolean;
  lastChecked: number;
  error?: string;
  retryCount: number;
  nextRetry?: number;
};

type FeatureName = 'chatReset' | 'analytics' | 'computerUse' | 'extendedThinking';

type Features = {
  [K in FeatureName]: FeatureStatus;
};

const isBrowser = typeof window !== 'undefined';

const createInitialFeatureStatus = (defaultAvailable: boolean = false): FeatureStatus => ({
  isAvailable: defaultAvailable,
  lastChecked: 0,
  retryCount: 0
});

class FeatureFlags {
  private static instance: FeatureFlags;
  private features: Features = {
    chatReset: createInitialFeatureStatus(),
    analytics: createInitialFeatureStatus(true), // Analytics is always available locally
    computerUse: createInitialFeatureStatus(true), // Computer use starts as enabled
    extendedThinking: createInitialFeatureStatus(true) // Extended thinking starts as enabled
  };

  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 second

  private constructor() {
    if (isBrowser) {
      this.loadFromStorage();
    }
  }

  static getInstance(): FeatureFlags {
    if (!FeatureFlags.instance) {
      FeatureFlags.instance = new FeatureFlags();
    }
    return FeatureFlags.instance;
  }

  private calculateBackoff(retryCount: number): number {
    const exp = Math.min(retryCount, 31);
    const baseDelay = this.baseDelay * Math.pow(2, exp);
    const jitter = Math.random() * 0.1 * baseDelay;
    return Math.min(baseDelay + jitter, 30 * 60 * 1000);
  }

  private shouldRecheck(feature: FeatureName): boolean {
    if (!isBrowser) return false;
    
    // Features managed locally
    if (feature === 'analytics' || feature === 'computerUse' || feature === 'extendedThinking') return false;

    const featureStatus = this.features[feature];
    const now = Date.now();

    if (featureStatus.nextRetry !== undefined && now < featureStatus.nextRetry) {
      return false;
    }

    if (featureStatus.isAvailable) {
      return now - featureStatus.lastChecked > 5 * 60 * 1000;
    }

    return true;
  }

  private async checkEndpoint(feature: FeatureName): Promise<boolean> {
    if (!isBrowser || feature === 'analytics' || feature === 'computerUse' || feature === 'extendedThinking') return true;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'}/codai/chat/reset`,
        {
          method: 'OPTIONS',
          headers: {
            'Accept': 'application/json',
          }
        }
      );

      // Consider 404 as feature not available but not an error
      const isAvailable = response.status !== 404 && response.ok;
      
      analytics.trackEvent('feature_check', feature, {
        success: isAvailable,
        error: isAvailable ? undefined : `HTTP ${response.status}`
      });
      
      if (isAvailable !== this.features[feature].isAvailable) {
        notifications.showFeatureStatus(feature, isAvailable);
      }

      return isAvailable;
    } catch (error) {
      analytics.trackEvent('feature_check', feature, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async checkFeatureAvailability(feature: FeatureName): Promise<boolean> {
    if (!isBrowser) return false;
    
    // Ensure feature is initialized
    if (!this.features[feature]) {
      this.features[feature] = createInitialFeatureStatus(
        feature === 'analytics' || feature === 'computerUse' || feature === 'extendedThinking'
      );
    }

    // Locally managed features
    if (feature === 'analytics' || feature === 'computerUse' || feature === 'extendedThinking') {
      return this.features[feature].isAvailable;
    }

    if (!this.shouldRecheck(feature)) {
      return this.features[feature].isAvailable;
    }

    const currentStatus = this.features[feature];
    const retryCount = currentStatus.retryCount;

    try {
      const isAvailable = await this.checkEndpoint(feature);
      
      this.features[feature] = {
        isAvailable,
        lastChecked: Date.now(),
        retryCount: isAvailable ? 0 : retryCount + 1,
        nextRetry: isAvailable ? undefined : Date.now() + this.calculateBackoff(retryCount)
      };

      this.persistToStorage();
      return isAvailable;
    } catch (error) {
      const nextRetryDelay = this.calculateBackoff(retryCount);
      
      this.features[feature] = {
        isAvailable: false,
        lastChecked: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount: retryCount + 1,
        nextRetry: Date.now() + nextRetryDelay
      };

      this.persistToStorage();
      return false;
    }
  }

  // New method to toggle computerUse feature
  toggleComputerUse(): boolean {
    if (!isBrowser) return false;
    
    const newState = !this.features.computerUse.isAvailable;
    this.features.computerUse = {
      ...this.features.computerUse,
      isAvailable: newState,
      lastChecked: Date.now()
    };
    
    this.persistToStorage();
    return newState;
  }
  
  // Method to toggle extended thinking feature
  toggleExtendedThinking(): boolean {
    if (!isBrowser) return false;
    
    const newState = !this.features.extendedThinking.isAvailable;
    this.features.extendedThinking = {
      ...this.features.extendedThinking,
      isAvailable: newState,
      lastChecked: Date.now()
    };
    
    // Also save to localStorage directly for the UI components
    localStorage.setItem('showExtendedThinking', String(newState));
    
    this.persistToStorage();
    return newState;
  }

  getFeatureStatus(feature: FeatureName): FeatureStatus {
    // Locally managed features always return current state
    if (feature === 'analytics' || feature === 'computerUse' || feature === 'extendedThinking') {
      return {
        isAvailable: this.features[feature].isAvailable,
        lastChecked: Date.now(),
        retryCount: 0
      };
    }

    if (!isBrowser || !this.features[feature]) {
      return createInitialFeatureStatus();
    }
    return this.features[feature];
  }

  private persistToStorage(): void {
    if (!isBrowser) return;
    try {
      localStorage.setItem('feature_flags', JSON.stringify({
        version: '1.0.0',
        features: this.features
      }));
    } catch (error) {
      // Handle error silently
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('feature_flags');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.version === '1.0.0') {
          const loadedFeatures = data.features as Partial<Features>;
          Object.keys(this.features).forEach(key => {
            const feature = key as FeatureName;
            const defaultAvailable = feature === 'analytics' || feature === 'computerUse';
            this.features[feature] = {
              ...createInitialFeatureStatus(defaultAvailable),
              ...loadedFeatures[feature]
            };
          });
        }
      }
    } catch (error) {
      // Handle error silently
      // Reset to defaults on error
      this.features.analytics = createInitialFeatureStatus(true);
      this.features.computerUse = createInitialFeatureStatus(true);
      this.features.extendedThinking = createInitialFeatureStatus(true);
      this.features.chatReset = createInitialFeatureStatus();
    }
  }
}

export const featureFlags = FeatureFlags.getInstance();