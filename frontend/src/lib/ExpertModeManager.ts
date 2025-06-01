/**
 * Expert Mode Manager for handling sophisticated UI states and user interactions
 */

export interface ExpertModeStatus {
  type: 'expert_mode_status'
  status: 'preparing' | 'analyzing' | 'activated' | 'failed'
  message: string
  domain?: string
  request_type?: string
}

export class ExpertModeManager {
  private currentStatus: ExpertModeStatus | null = null
  private startTime: number | null = null
  private cardId: string
  
  constructor() {
    this.currentStatus = null
    this.cardId = `expert-mode-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Process expert mode status update and return HTML
   * Returns an object with the HTML and a flag indicating if this should replace previous content
   */
  processStatus(statusData: ExpertModeStatus): { html: string; shouldReplace: boolean } {
    const previousStatus = this.currentStatus?.status
    this.currentStatus = statusData
    
    // Start timing if this is the first status
    if (!this.startTime && statusData.status === 'preparing') {
      this.startTime = Date.now()
    }
    
    // Determine if we should replace previous content
    const shouldReplace = previousStatus !== null && (
      (previousStatus === 'preparing' && statusData.status === 'analyzing') ||
      (previousStatus === 'analyzing' && statusData.status === 'activated') ||
      (previousStatus === 'analyzing' && statusData.status === 'failed')
    )
    
    let html: string
    switch (statusData.status) {
      case 'preparing':
        html = this.renderPreparingState()
        break
      case 'analyzing':
        html = this.renderAnalyzingState()
        break
      case 'activated':
        html = this.renderActivatedState(statusData.domain, statusData.request_type)
        break
      case 'failed':
        html = this.renderFailedState()
        break
      default:
        html = this.renderUnknownState()
        break
    }
    
    return { html, shouldReplace }
  }



  /**
   * Render preparing state
   */
  private renderPreparingState(): string {
    return `
      <div id="${this.cardId}" class="expert-mode-card preparing" data-expert-status="preparing">
        <div class="expert-mode-content">
          <div class="expert-mode-header">
            <svg class="expert-mode-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            <span class="expert-mode-title">Preparing analysis...</span>
          </div>
          <div class="expert-mode-description">
            Getting ready for domain analysis
          </div>
        </div>
      </div>
    `
  }

  /**
   * Render analyzing state
   */
  private renderAnalyzingState(): string {
    const elapsed = this.startTime ? Math.round((Date.now() - this.startTime) / 100) / 10 : 0
    
    return `
      <div id="${this.cardId}" class="expert-mode-card analyzing" data-expert-status="analyzing">
        <div class="expert-mode-content">
          <div class="expert-mode-header">
            <svg class="expert-mode-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            <span class="expert-mode-title">🎯 Analyzing request for optimal expertise...</span>
          </div>
          <div class="expert-mode-description">
            Identifying optimal domain expertise${elapsed > 0 ? ` • ${elapsed}s` : ''}
          </div>
        </div>
      </div>
    `
  }

  /**
   * Render activated state with domain result
   */
  private renderActivatedState(domain?: string, requestType?: string): string {
    const elapsed = this.startTime ? Math.round((Date.now() - this.startTime) / 100) / 10 : 0
    const domainDisplay = domain || 'general expertise'
    const requestTypeDisplay = requestType ? ` (${requestType})` : ''
    
    return `
      <div id="${this.cardId}" class="expert-mode-card activated" data-expert-status="activated">
        <div class="expert-mode-content">
          <div class="expert-mode-header">
            <span class="expert-mode-icon">🎯</span>
            <span class="expert-mode-title">Analysis complete, expertise applied</span>
            <span class="expert-mode-timing">${elapsed > 0 ? `${elapsed}s` : ''}</span>
          </div>
          <div class="expert-mode-domain">
            <strong>Domain:</strong> ${domainDisplay}${requestTypeDisplay}
          </div>
          <div class="expert-mode-description">
            Responding with enhanced domain expertise
          </div>
        </div>
      </div>
    `
  }

  /**
   * Render failed state
   */
  private renderFailedState(): string {
    return `
      <div id="${this.cardId}" class="expert-mode-card failed" data-expert-status="failed">
        <div class="expert-mode-content">
          <div class="expert-mode-header">
            <span class="expert-mode-icon">⚠️</span>
            <span class="expert-mode-title">Expert mode analysis failed</span>
          </div>
          <div class="expert-mode-description">
            Continuing with standard AI capabilities
          </div>
        </div>
      </div>
    `
  }

  /**
   * Render unknown state
   */
  private renderUnknownState(): string {
    return `
      <div id="${this.cardId}" class="expert-mode-card unknown" data-expert-status="unknown">
        <div class="expert-mode-content">
          <div class="expert-mode-header">
            <span class="expert-mode-icon">🤔</span>
            <span class="expert-mode-title">Expert mode status unknown</span>
          </div>
        </div>
      </div>
    `
  }

  /**
   * Get the CSS styles for expert mode components
   */
  static getStyles(): string {
    return `
      <style>
        .expert-mode-card {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          margin: 12px 0;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .expert-mode-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #3b82f6, #8b5cf6);
          transition: opacity 0.3s ease;
        }

        .expert-mode-card.preparing::before {
          background: linear-gradient(90deg, #f59e0b, #ea580c);
        }

        .expert-mode-card.analyzing::before {
          background: linear-gradient(90deg, #3b82f6, #1d4ed8);
        }

        .expert-mode-card.activated::before {
          background: linear-gradient(90deg, #10b981, #059669);
        }

        .expert-mode-card.failed::before {
          background: linear-gradient(90deg, #ef4444, #dc2626);
        }

        .expert-mode-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .expert-mode-header {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
          color: #1e293b;
        }

        .expert-mode-spinner {
          color: #3b82f6;
          animation: spin 1s linear infinite;
        }

        .expert-mode-icon {
          font-size: 16px;
        }

        .expert-mode-title {
          flex: 1;
          font-size: 14px;
        }

        .expert-mode-timing {
          font-size: 12px;
          color: #64748b;
          font-weight: normal;
        }

        .expert-mode-domain {
          font-size: 13px;
          color: #334155;
          padding: 8px 12px;
          background: rgba(59, 130, 246, 0.05);
          border-radius: 6px;
          border-left: 3px solid #3b82f6;
        }

        .expert-mode-description {
          font-size: 12px;
          color: #64748b;
          line-height: 1.4;
        }


        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .expert-mode-card {
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            border-color: #475569;
            color: #e2e8f0;
          }

          .expert-mode-header {
            color: #f1f5f9;
          }

          .expert-mode-domain {
            background: rgba(59, 130, 246, 0.1);
            color: #e2e8f0;
          }

          .expert-mode-description {
            color: #94a3b8;
          }
        }
      </style>
    `
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    // No intervals to clean up anymore since we use CSS animation
  }
}