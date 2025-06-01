/**
 * Debug utilities for expert mode
 */

// Global flag to enable expert mode debugging
export const EXPERT_MODE_DEBUG = true;

// Log expert mode events
export function logExpertMode(event: string, data?: any) {
  if (EXPERT_MODE_DEBUG) {
    console.log(`[Expert Mode] ${event}`, data || '');
  }
}

// Check if expert mode is working by monitoring console logs
export function checkExpertModeStatus() {
  console.log(`
=== Expert Mode Debug Info ===
1. Check browser console for "[Expert Mode]" logs
2. Look for these events:
   - "Expert mode status received" in StreamParser
   - "System message received" in StreamProcessor  
   - "Expert mode analyzing request" in StreamProcessor
3. In the chat UI, you should see:
   - "🎯 Analyzing request for optimal expertise..." message
   - Enhanced AI response with domain expertise
4. Check browser Network tab for:
   - expert_mode_status event in the SSE stream
=============================
  `);
}