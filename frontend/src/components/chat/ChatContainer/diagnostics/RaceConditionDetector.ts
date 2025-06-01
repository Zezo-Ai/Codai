export interface Operation {
  id: string
  type: 'scroll' | 'render' | 'state-update' | 'dom-mutation' | 'animation'
  startTime: number
  endTime?: number
  metadata?: Record<string, any>
}

export interface Overlap {
  operation1: Operation
  operation2: Operation
  overlapDuration: number
  severity: 'low' | 'medium' | 'high'
  description: string
}

export interface RaceConditionReport {
  totalOperations: number
  overlaps: Overlap[]
  criticalPaths: string[][]
  recommendations: string[]
  score: number // 0-100, higher is better
}

export class RaceConditionDetector {
  private operations: Map<string, Operation> = new Map()
  private completedOperations: Operation[] = []
  private overlaps: Overlap[] = []
  private operationCounter = 0
  private warningThreshold = 10 // ms
  private criticalThreshold = 50 // ms

  trackOperationStart(
    type: Operation['type'],
    metadata?: Record<string, any>
  ): string {
    const id = `${type}-${++this.operationCounter}-${Date.now()}`
    const operation: Operation = {
      id,
      type,
      startTime: performance.now(),
      metadata
    }
    
    this.operations.set(id, operation)
    this.checkForImmediateConflicts(operation)
    
    return id
  }

  trackOperationEnd(id: string): void {
    const operation = this.operations.get(id)
    if (!operation) {
      console.warn(`Operation ${id} not found`)
      return
    }
    
    operation.endTime = performance.now()
    this.operations.delete(id)
    this.completedOperations.push(operation)
    
    // Keep only recent operations
    if (this.completedOperations.length > 1000) {
      this.completedOperations = this.completedOperations.slice(-500)
    }
    
    this.analyzeOperation(operation)
  }

  private checkForImmediateConflicts(newOp: Operation): void {
    // Check against currently running operations
    for (const [_, runningOp] of this.operations) {
      if (runningOp.id === newOp.id) continue
      
      if (this.areOperationsConflicting(newOp, runningOp)) {
        console.warn(
          `Potential race condition detected: ${newOp.type} started while ${runningOp.type} is running`
        )
      }
    }
  }

  private areOperationsConflicting(op1: Operation, op2: Operation): boolean {
    // Define conflict rules
    const conflictMatrix: Record<string, string[]> = {
      'scroll': ['render', 'dom-mutation'],
      'render': ['scroll', 'state-update', 'dom-mutation'],
      'state-update': ['render', 'animation'],
      'dom-mutation': ['scroll', 'render', 'animation'],
      'animation': ['state-update', 'dom-mutation']
    }
    
    return conflictMatrix[op1.type]?.includes(op2.type) || false
  }

  private analyzeOperation(completedOp: Operation): void {
    if (!completedOp.endTime) return
    
    const duration = completedOp.endTime - completedOp.startTime
    
    // Check for overlaps with other completed operations
    for (const otherOp of this.completedOperations) {
      if (otherOp.id === completedOp.id || !otherOp.endTime) continue
      
      const overlap = this.calculateOverlap(completedOp, otherOp)
      if (overlap > 0) {
        const severity = this.calculateSeverity(overlap, completedOp, otherOp)
        
        this.overlaps.push({
          operation1: completedOp,
          operation2: otherOp,
          overlapDuration: overlap,
          severity,
          description: this.generateOverlapDescription(completedOp, otherOp, overlap)
        })
      }
    }
    
    // Performance warnings
    if (duration > 100) {
      console.warn(
        `Long-running operation detected: ${completedOp.type} took ${duration.toFixed(2)}ms`
      )
    }
  }

  private calculateOverlap(op1: Operation, op2: Operation): number {
    if (!op1.endTime || !op2.endTime) return 0
    
    const start = Math.max(op1.startTime, op2.startTime)
    const end = Math.min(op1.endTime, op2.endTime)
    
    return Math.max(0, end - start)
  }

  private calculateSeverity(
    overlap: number,
    op1: Operation,
    op2: Operation
  ): Overlap['severity'] {
    // Consider both overlap duration and operation types
    if (overlap > this.criticalThreshold) return 'high'
    if (overlap > this.warningThreshold) return 'medium'
    
    // Even small overlaps can be critical for certain operation pairs
    if (this.areOperationsConflicting(op1, op2)) {
      return overlap > 5 ? 'medium' : 'low'
    }
    
    return 'low'
  }

  private generateOverlapDescription(
    op1: Operation,
    op2: Operation,
    overlap: number
  ): string {
    const conflicting = this.areOperationsConflicting(op1, op2)
    const verb = conflicting ? 'conflicts with' : 'overlaps with'
    
    return `${op1.type} ${verb} ${op2.type} for ${overlap.toFixed(2)}ms`
  }

  detectCriticalPaths(): string[][] {
    const paths: string[][] = []
    const graph = this.buildOperationGraph()
    
    // Find paths with multiple overlapping operations
    for (const op of this.completedOperations) {
      const path = this.findCriticalPath(op, graph)
      if (path.length > 2) {
        paths.push(path.map(o => `${o.type}(${o.id})`))
      }
    }
    
    return paths
  }

  private buildOperationGraph(): Map<string, Set<Operation>> {
    const graph = new Map<string, Set<Operation>>()
    
    for (const overlap of this.overlaps) {
      if (!graph.has(overlap.operation1.id)) {
        graph.set(overlap.operation1.id, new Set())
      }
      if (!graph.has(overlap.operation2.id)) {
        graph.set(overlap.operation2.id, new Set())
      }
      
      graph.get(overlap.operation1.id)!.add(overlap.operation2)
      graph.get(overlap.operation2.id)!.add(overlap.operation1)
    }
    
    return graph
  }

  private findCriticalPath(
    start: Operation,
    graph: Map<string, Set<Operation>>
  ): Operation[] {
    const visited = new Set<string>()
    const path: Operation[] = []
    
    const dfs = (op: Operation): void => {
      if (visited.has(op.id)) return
      
      visited.add(op.id)
      path.push(op)
      
      const neighbors = graph.get(op.id)
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (this.areOperationsConflicting(op, neighbor)) {
            dfs(neighbor)
          }
        }
      }
    }
    
    dfs(start)
    return path
  }

  generateReport(): RaceConditionReport {
    const criticalOverlaps = this.overlaps.filter(o => o.severity === 'high')
    const mediumOverlaps = this.overlaps.filter(o => o.severity === 'medium')
    
    const score = Math.max(
      0,
      100 - criticalOverlaps.length * 10 - mediumOverlaps.length * 3
    )
    
    const recommendations = this.generateRecommendations()
    const criticalPaths = this.detectCriticalPaths()
    
    return {
      totalOperations: this.completedOperations.length,
      overlaps: this.overlaps,
      criticalPaths,
      recommendations,
      score
    }
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = []
    
    // Analyze patterns
    const typeFrequency = new Map<string, number>()
    for (const overlap of this.overlaps) {
      const key = `${overlap.operation1.type}-${overlap.operation2.type}`
      typeFrequency.set(key, (typeFrequency.get(key) || 0) + 1)
    }
    
    // Generate specific recommendations
    for (const [pair, count] of typeFrequency) {
      if (count > 5) {
        const [type1, type2] = pair.split('-')
        recommendations.push(
          `Frequent conflicts between ${type1} and ${type2} operations. Consider:
          - Debouncing ${type1} operations
          - Using requestAnimationFrame for ${type2}
          - Implementing operation queuing`
        )
      }
    }
    
    if (this.overlaps.some(o => o.overlapDuration > 100)) {
      recommendations.push(
        'Long-running operations detected. Consider:
        - Breaking operations into smaller chunks
        - Using Web Workers for heavy computations
        - Implementing progressive rendering'
      )
    }
    
    const scrollConflicts = this.overlaps.filter(
      o => o.operation1.type === 'scroll' || o.operation2.type === 'scroll'
    )
    if (scrollConflicts.length > 10) {
      recommendations.push(
        'Multiple scroll conflicts detected. Consider:
        - Implementing scroll throttling
        - Using passive event listeners
        - Batching DOM updates during scroll'
      )
    }
    
    return recommendations
  }

  reset(): void {
    this.operations.clear()
    this.completedOperations = []
    this.overlaps = []
    this.operationCounter = 0
  }

  // Utility method for testing
  simulateRaceCondition(): void {
    const id1 = this.trackOperationStart('scroll')
    const id2 = this.trackOperationStart('render')
    
    setTimeout(() => this.trackOperationEnd(id1), 50)
    setTimeout(() => this.trackOperationEnd(id2), 30)
  }
}

// Helper class for automatic tracking
export class AutoTracker {
  private detector: RaceConditionDetector
  private activeOperations: Map<string, string> = new Map()

  constructor(detector: RaceConditionDetector) {
    this.detector = detector
  }

  track<T>(
    operationType: Operation['type'],
    operation: () => T | Promise<T>,
    metadata?: Record<string, any>
  ): T | Promise<T> {
    const id = this.detector.trackOperationStart(operationType, metadata)
    
    try {
      const result = operation()
      
      if (result instanceof Promise) {
        return result.finally(() => {
          this.detector.trackOperationEnd(id)
        })
      } else {
        this.detector.trackOperationEnd(id)
        return result
      }
    } catch (error) {
      this.detector.trackOperationEnd(id)
      throw error
    }
  }

  wrapFunction<T extends (...args: any[]) => any>(
    fn: T,
    operationType: Operation['type']
  ): T {
    return ((...args: Parameters<T>) => {
      return this.track(operationType, () => fn(...args))
    }) as T
  }
}