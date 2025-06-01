export type ActionState = {
  actionInProgress: string | null
  activeSessionId: string
  error: Error | null
  retryCount: number
}

export type ActionType =
  | { type: 'START_ACTION'; payload: string }
  | { type: 'END_ACTION' }
  | { type: 'SET_ACTIVE_SESSION'; payload: string }
  | { type: 'SET_ERROR'; payload: Error }
  | { type: 'CLEAR_ERROR' }
  | { type: 'INCREMENT_RETRY' }
  | { type: 'RESET_RETRY' }

export function chatSidebarReducer(state: ActionState, action: ActionType): ActionState {
  switch (action.type) {
    case 'START_ACTION':
      return {
        ...state,
        actionInProgress: action.payload,
        error: null
      }
    
    case 'END_ACTION':
      return {
        ...state,
        actionInProgress: null,
        retryCount: 0
      }
    
    case 'SET_ACTIVE_SESSION':
      return {
        ...state,
        activeSessionId: action.payload,
        error: null
      }
    
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        actionInProgress: null
      }
    
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      }
    
    case 'INCREMENT_RETRY':
      return {
        ...state,
        retryCount: state.retryCount + 1
      }
    
    case 'RESET_RETRY':
      return {
        ...state,
        retryCount: 0
      }
    
    default:
      return state
  }
}