export interface ScrollOperation {
  id: string;
  type: 'user-scroll' | 'auto-scroll' | 'force-scroll' | 'content-update';
  timestamp: number;
  source: string;
  metadata?: Record<string, any>;
}

export interface RaceCondition {
  operations: ScrollOperation[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
  timestamp: number;
}

export class RaceConditionDetector {
  private operations: ScrollOperation[] = [];
  private detectedConditions: RaceCondition[] = [];
  private readonly OPERATION_WINDOW = 100; // ms to consider operations concurrent
  private readonly MAX_OPERATIONS = 1000;
  
  public recordOperation(operation: Omit<ScrollOperation, 'id' | 'timestamp'>): void {
    const op: ScrollOperation = {
      ...operation,
      id: this.generateId(),
      timestamp: performance.now()
    };
    
    this.operations.push(op);
    
    // Keep operations list bounded
    if (this.operations.length > this.MAX_OPERATIONS) {
      this.operations = this.operations.slice(-this.MAX_OPERATIONS);
    }
    
    // Check for race conditions
    this.detectRaceConditions();
  }
  
  public getDetectedConditions(): RaceCondition[] {
    return [...this.detectedConditions];
  }
  
  public getCriticalConditions(): RaceCondition[] {
    return this.detectedConditions.filter(c => c.severity === 'critical');
  }
  
  public clear(): void {
    this.operations = [];
    this.detectedConditions = [];
  }
  
  public getOperationGraph(): string {
    const recentOps = this.operations.slice(-20);
    const graph: string[] = ['Operation Timeline:'];
    
    recentOps.forEach((op, index) => {
      const symbol = this.getOperationSymbol(op.type);
      const time = op.timestamp.toFixed(0);
      graph.push(`${time}ms: ${symbol} ${op.type} (${op.source})`);
    });
    
    return graph.join('\n');
  }
  
  private detectRaceConditions(): void {
    const recent = this.operations.slice(-10);
    if (recent.length < 2) return;
    
    // Check for concurrent operations
    for (let i = 0; i < recent.length - 1; i++) {
      for (let j = i + 1; j < recent.length; j++) {
        const op1 = recent[i];
        const op2 = recent[j];
        const timeDiff = Math.abs(op2.timestamp - op1.timestamp);
        
        if (timeDiff < this.OPERATION_WINDOW) {
          this.checkForConflict(op1, op2);
        }
      }
    }
    
    // Check for rapid repeated operations
    this.checkForRapidRepeats();
    
    // Check for conflicting operation patterns
    this.checkForPatterns();
  }
  
  private checkForConflict(op1: ScrollOperation, op2: ScrollOperation): void {
    // User scroll vs auto-scroll
    if (
      (op1.type === 'user-scroll' && op2.type === 'auto-scroll') ||
      (op1.type === 'auto-scroll' && op2.type === 'user-scroll')
    ) {
      this.addCondition({
        operations: [op1, op2],
        severity: 'high',
        description: 'User scroll and auto-scroll occurring simultaneously',
        recommendation: 'Ensure auto-scroll is disabled during user interaction',
        timestamp: performance.now()
      });
    }
    
    // Multiple auto-scrolls
    if (op1.type === 'auto-scroll' && op2.type === 'auto-scroll') {
      this.addCondition({
        operations: [op1, op2],
        severity: 'critical',
        description: 'Multiple auto-scroll operations detected',
        recommendation: 'Consolidate scroll handlers into single manager',
        timestamp: performance.now()
      });
    }
    
    // Content update during scroll
    if (
      (op1.type === 'content-update' && (op2.type === 'user-scroll' || op2.type === 'auto-scroll')) ||
      ((op1.type === 'user-scroll' || op1.type === 'auto-scroll') && op2.type === 'content-update')
    ) {
      this.addCondition({
        operations: [op1, op2],
        severity: 'medium',
        description: 'Content update during active scrolling',
        recommendation: 'Defer content updates until scroll completes',
        timestamp: performance.now()
      });
    }
  }
  
  private checkForRapidRepeats(): void {
    const recentAutoScrolls = this.operations
      .filter(op => op.type === 'auto-scroll')
      .slice(-5);
    
    if (recentAutoScrolls.length >= 3) {
      const timeSpan = recentAutoScrolls[recentAutoScrolls.length - 1].timestamp - 
                      recentAutoScrolls[0].timestamp;
      
      if (timeSpan < 500) { // 3+ auto-scrolls in 500ms
        this.addCondition({
          operations: recentAutoScrolls,
          severity: 'high',
          description: `${recentAutoScrolls.length} auto-scroll operations in ${timeSpan.toFixed(0)}ms`,
          recommendation: 'Implement scroll debouncing or throttling',
          timestamp: performance.now()
        });
      }
    }
  }
  
  private checkForPatterns(): void {
    // Check for scroll ping-pong (user scrolls up, auto scrolls down repeatedly)
    const recent = this.operations.slice(-6);
    let pingPongCount = 0;
    
    for (let i = 0; i < recent.length - 1; i++) {
      if (
        recent[i].type === 'user-scroll' && 
        recent[i + 1].type === 'auto-scroll'
      ) {
        pingPongCount++;
      }
    }
    
    if (pingPongCount >= 2) {
      this.addCondition({
        operations: recent,
        severity: 'critical',
        description: 'Scroll ping-pong detected - user and auto-scroll fighting for control',
        recommendation: 'Implement proper scroll ownership and state management',
        timestamp: performance.now()
      });
    }
  }
  
  private addCondition(condition: RaceCondition): void {
    // Avoid duplicate conditions
    const isDuplicate = this.detectedConditions.some(existing => 
      existing.description === condition.description &&
      Math.abs(existing.timestamp - condition.timestamp) < 1000
    );
    
    if (!isDuplicate) {
      this.detectedConditions.push(condition);
      
      // Keep conditions list bounded
      if (this.detectedConditions.length > 100) {
        this.detectedConditions = this.detectedConditions.slice(-100);
      }
    }
  }
  
  private getOperationSymbol(type: ScrollOperation['type']): string {
    switch (type) {
      case 'user-scroll': return '👤';
      case 'auto-scroll': return '🤖';
      case 'force-scroll': return '⚡';
      case 'content-update': return '📝';
      default: return '❓';
    }
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  public getSeverityScore(): number {
    const weights = {
      low: 1,
      medium: 2,
      high: 5,
      critical: 10
    };
    
    return this.detectedConditions.reduce((score, condition) => {
      return score + weights[condition.severity];
    }, 0);
  }
  
  public getReport(): string {
    const report: string[] = [
      '=== Race Condition Report ===',
      `Total Operations: ${this.operations.length}`,
      `Detected Conditions: ${this.detectedConditions.length}`,
      `Severity Score: ${this.getSeverityScore()}`,
      ''
    ];
    
    if (this.detectedConditions.length > 0) {
      report.push('Recent Conditions:');
      this.detectedConditions.slice(-5).forEach(condition => {
        report.push(`- [${condition.severity.toUpperCase()}] ${condition.description}`);
        report.push(`  Recommendation: ${condition.recommendation}`);
        report.push('');
      });
    }
    
    report.push(this.getOperationGraph());
    
    return report.join('\n');
  }
}

// Singleton instance
export const raceConditionDetector = new RaceConditionDetector();