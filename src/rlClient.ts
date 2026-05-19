import type { FeedbackRequest, RecommendationRequest, RecommendationResponse } from './types'

const defaultRecommendationError = 'Could not get a learned suggestion.'
const defaultFeedbackError = 'Could not save recommendation feedback.'

export async function requestRecommendation(
  payload: RecommendationRequest,
): Promise<RecommendationResponse> {
  const response = await fetch('/rl-api/recommend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = (await response.json()) as RecommendationResponse & { error?: string }

  if (!response.ok) {
    throw new Error(data.error || defaultRecommendationError)
  }

  return data
}

export async function sendRecommendationFeedback(payload: FeedbackRequest): Promise<void> {
  const response = await fetch('/rl-api/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const data = (await response.json()) as { error?: string }
    throw new Error(data.error || defaultFeedbackError)
  }
}
