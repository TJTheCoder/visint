export type CameraStatus = 'idle' | 'loading' | 'ready' | 'error'
export type AnalysisStatus = 'idle' | 'loading' | 'done' | 'error'
export type RecommendationStatus = 'idle' | 'waiting-actions' | 'loading' | 'done' | 'error'

export type PrimarySceneType =
  | 'event'
  | 'receipt'
  | 'contact'
  | 'link'
  | 'foreign_text'
  | 'math'
  | 'parking'
  | 'general'

export type ContextualActionType =
  | 'TRANSLATE'
  | 'OPEN_LINK'
  | 'SOLVE'
  | 'ADD_CONTACT'
  | 'SAVE_EXPENSE'
  | 'SET_REMINDER'
  | 'ADD_EVENT'

export type FallbackActionType = 'ASK' | 'SEARCH'
export type RLActionType = FallbackActionType | ContextualActionType

export const ACTION_TYPE_TO_ID = {
  ASK: 0,
  SEARCH: 1,
  TRANSLATE: 2,
  OPEN_LINK: 3,
  SOLVE: 4,
  ADD_CONTACT: 5,
  SAVE_EXPENSE: 6,
  SET_REMINDER: 7,
  ADD_EVENT: 8,
} as const satisfies Record<RLActionType, number>

export const ACTION_ID_TO_TYPE = {
  0: 'ASK',
  1: 'SEARCH',
  2: 'TRANSLATE',
  3: 'OPEN_LINK',
  4: 'SOLVE',
  5: 'ADD_CONTACT',
  6: 'SAVE_EXPENSE',
  7: 'SET_REMINDER',
  8: 'ADD_EVENT',
} as const satisfies Record<number, RLActionType>

export type TranslateAction = {
  type: 'TRANSLATE'
  label: 'Translate'
  confidence: number
  payload: {
    sourceLanguage: string
    detectedText: string
    translatedText: string
  }
}

export type OpenLinkAction = {
  type: 'OPEN_LINK'
  label: 'Open Link'
  confidence: number
  payload: {
    url: string
    displayText: string
  }
}

export type SolveAction = {
  type: 'SOLVE'
  label: 'Solve'
  confidence: number
  payload: {
    problemText: string
    solutionSummary: string
    steps: string[]
    finalAnswer: string
  }
}

export type AddContactAction = {
  type: 'ADD_CONTACT'
  label: 'Add Contact'
  confidence: number
  payload: {
    name: string | null
    company: string | null
    phone: string | null
    email: string | null
    website: string | null
    address: string | null
  }
}

export type SaveExpenseAction = {
  type: 'SAVE_EXPENSE'
  label: 'Save Expense'
  confidence: number
  payload: {
    merchant: string | null
    date: string | null
    total: string | null
    currency: string | null
    category: 'Meals' | 'Travel' | 'Office' | 'Shopping' | 'Other' | null
    lineItems: Array<{
      name: string
      amount: string | null
    }>
  }
}

export type SetReminderAction = {
  type: 'SET_REMINDER'
  label: 'Set Reminder'
  confidence: number
  payload: {
    title: string
    suggestedReminderText: string
    dateTimeText: string | null
    relativeTimeMinutes: number | null
    reason: string
  }
}

export type AddEventAction = {
  type: 'ADD_EVENT'
  label: 'Add Event'
  confidence: number
  payload: {
    title: string
    date: string | null
    startTime: string | null
    endTime: string | null
    location: string | null
    description: string | null
  }
}

export type ContextualAction =
  | TranslateAction
  | OpenLinkAction
  | SolveAction
  | AddContactAction
  | SaveExpenseAction
  | SetReminderAction
  | AddEventAction

export type FallbackAction = {
  type: FallbackActionType
  label: 'Ask' | 'Search'
  payload: {
    summary: string
  }
}

export type DisplayAction = ContextualAction | FallbackAction

export type AnalysisResponse = {
  summary: string
  primarySceneType: PrimarySceneType
  actions: ContextualAction[]
}

export type RLObservation = {
  scene_type: PrimarySceneType
  summary: string
  actions: ContextualAction[]
  allowed_action_ids: number[]
  image_features: null
}

export type RecommendationDebug = {
  allowed_action_ids: number[]
  masked: boolean
  checkpoint: string | null
  replay_size: number
  mode?: string
  warning?: string | null
}

export type RecommendationResponse = {
  recommended_action_id: number
  recommended_action_type: RLActionType
  confidence: number
  policy_debug: RecommendationDebug
}

export type RecommendationRequest = {
  episode_id: string
  observation: RLObservation
}

export type FeedbackRequest = {
  episode_id: string
  recommended_action_id: number
  chosen_action_id: number | null
  accepted: boolean
  reward: number
  allowed_action_ids: number[]
  observation: RLObservation
}
