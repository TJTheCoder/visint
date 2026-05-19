import type { FeedbackRequest, RecommendationRequest, RecommendationResponse } from './types'

const defaultRecommendationError = 'Could not get a learned suggestion.'
const defaultFeedbackError = 'Could not save recommendation feedback.'

export async function requestRecommendation(
  payload: RecommendationRequest,
): Promise<RecommendationResponse> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => {
    controller.abort()
  }, 8000)

  try {
    const response = await fetch('/rl-api/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const data = (await response.json()) as RecommendationResponse & { error?: string }

    if (!response.ok) {
      throw new Error(data.error || defaultRecommendationError)
    }

    return data
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Learned suggestion timed out.', { cause: error })
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
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
