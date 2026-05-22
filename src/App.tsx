import { useEffect, useEffectEvent, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { requestRecommendation, sendRecommendationFeedback } from './rlClient'
import {
  ACTION_ID_TO_TYPE,
  ACTION_TYPE_TO_ID,
  type AddContactAction,
  type AddEventAction,
  type AnalysisResponse,
  type AnalysisStatus,
  type CameraStatus,
  type ContextualAction,
  type ContextualActionType,
  type DisplayAction,
  type FallbackAction,
  type FallbackActionType,
  type FeedbackRequest,
  type PrimarySceneType,
  type RecommendationResponse,
  type RecommendationStatus,
  type RLActionType,
  type RLObservation,
  type SetReminderAction,
} from './types'

type CaptureIntent = 'manual' | 'recommend'
type SavedActionPreset = {
  actionType: RLActionType
  label: string
  params: Record<string, unknown>
  savedAt: number
}
type CachedObservation = {
  capturedAt: number
  summary: string
  sceneType: PrimarySceneType
  contextualActions: ContextualAction[]
  allowedActionIds: number[]
}

const defaultAnalysisError = 'Could not analyze image'
const holdToRecommendMs = 600
const autoOpenRecommendedSheet = true
const showRlDebugUi = import.meta.env.VITE_SHOW_RL_DEBUG === 'true'
const recentObservationReuseWindowMs = 20_000
const savedActionPresetsKey = 'visint.numberActionPresets.v1'

function AskIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.2 7.25h9.6c1.41 0 2.55 1.14 2.55 2.55v4.7c0 1.41-1.14 2.55-2.55 2.55h-5.4l-3.7 2.95.62-2.95H7.2c-1.41 0-2.55-1.14-2.55-2.55V9.8c0-1.41 1.14-2.55 2.55-2.55Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SearchIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="4.75" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M14.2 14.2 18.5 18.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function TranslateIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.75 7.25h8.5M9 5v2.25c0 4.2-1.95 7.6-5.25 9.85"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M6.65 11.6c1.1 1.35 2.55 2.45 4.15 3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="m14.6 16.95 2.45-7.1 2.45 7.1M15.3 14.95h3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LinkIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.4 13.6 8.2 15.8a3.2 3.2 0 1 1-4.55-4.55l3.2-3.2a3.2 3.2 0 0 1 4.55 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="m13.6 10.4 2.2-2.2a3.2 3.2 0 0 1 4.55 4.55l-3.2 3.2a3.2 3.2 0 0 1-4.55 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="m9.15 14.85 5.7-5.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SolveIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5.2" y="4.8" width="13.6" height="14.4" rx="2.3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M8.25 8.55h7.5M8.9 12.1h1.4M12 12.1h1.4M15.1 12.1h.05M8.9 15.25h1.4M12 15.25h1.4M15.1 15.25h.05"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ContactIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10" cy="9" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4.9 17.85c1.55-2.35 3.45-3.55 5.1-3.55s3.55 1.2 5.1 3.55M18.1 8.3v5.25M15.5 10.925h5.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ExpenseIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.2 4.9v14.2l2.2-1.35 2.6 1.35 2.6-1.35 2.2 1.35V4.9H7.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 8.35h5.1M9.5 11.55h5.1M9.5 14.75h3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ReminderIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="6.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 8.9v3.45l2.45 1.45"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EventIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.7" y="6.3" width="14.6" height="12.5" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M8.4 4.8v3.1M15.6 4.8v3.1M4.7 10.1h14.6M12 12.55v4.1M9.95 14.6h4.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BrainIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.05 5.8c-1.7 0-3.08 1.36-3.08 3.04 0 .34.06.67.17.98a2.8 2.8 0 0 0-1.84 2.62c0 1.18.74 2.19 1.79 2.59a2.98 2.98 0 0 0 2.96 2.76c1.53 0 2.8-1.15 2.97-2.64V8.77A2.98 2.98 0 0 0 9.05 5.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.95 5.8c1.7 0 3.08 1.36 3.08 3.04 0 .34-.06.67-.17.98a2.8 2.8 0 0 1 1.84 2.62 2.77 2.77 0 0 1-1.79 2.59 2.98 2.98 0 0 1-2.96 2.76 2.99 2.99 0 0 1-2.97-2.64V8.77a2.98 2.98 0 0 1 2.97-2.97Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.6 9.2c.92.22 1.62.95 1.83 1.9M8.55 12.65c1.05.23 1.9 1.02 2.18 2.04M15.4 9.2c-.92.22-1.62.95-1.83 1.9M15.45 12.65c-1.05.23-1.9 1.02-2.18 2.04M12 8.05v8.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function App() {
  const browserSupportsCamera =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  const feedbackSentRef = useRef(false)
  const skipNextAnalysisRef = useRef(false)
  const cachedObservationRef = useRef<CachedObservation | null>(null)
  const bypassRecommendationRef = useRef(false)
  const latestActionPresetRef = useRef<SavedActionPreset | null>(null)
  const savedActionPresetsRef = useRef<Record<string, SavedActionPreset>>(loadSavedActionPresets())

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>(
    browserSupportsCamera ? 'idle' : 'error',
  )
  const [errorMessage, setErrorMessage] = useState(
    browserSupportsCamera ? '' : 'This browser does not support camera access.',
  )
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [captureIntent, setCaptureIntent] = useState<CaptureIntent>('manual')
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle')
  const [analysisSummary, setAnalysisSummary] = useState('')
  const [analysisSceneType, setAnalysisSceneType] = useState<PrimarySceneType>('general')
  const [contextualActions, setContextualActions] = useState<ContextualAction[]>([])
  const [selectedAction, setSelectedAction] = useState<DisplayAction | null>(null)
  const [actionFeedback, setActionFeedback] = useState('')
  const [episodeId, setEpisodeId] = useState<string | null>(null)
  const [recommendationStatus, setRecommendationStatus] = useState<RecommendationStatus>('idle')
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null)
  const [recommendationError, setRecommendationError] = useState('')
  const [lastRewardSent, setLastRewardSent] = useState<number | null>(null)
  const [debugVisible, setDebugVisible] = useState(false)
  const [isShutterHolding, setIsShutterHolding] = useState(false)
  const [askQuestion, setAskQuestion] = useState('')
  const [askAnswer, setAskAnswer] = useState('')
  const [askStatus, setAskStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [translateLanguage, setTranslateLanguage] = useState('')
  const [customTranslation, setCustomTranslation] = useState('')
  const [translateStatus, setTranslateStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false

    const attachStream = async (stream: MediaStream) => {
      streamRef.current = stream

      if (!videoRef.current) {
        return
      }

      videoRef.current.srcObject = stream

      try {
        await videoRef.current.play()
      } catch {
        // Safari may delay autoplay even with playsInline; the stream stays attached.
      }
    }

    const startCamera = async () => {
      setCameraStatus('loading')
      setErrorMessage('')

      const preferredConstraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1170 },
          height: { ideal: 2532 },
        },
      }

      const fallbackConstraints: MediaStreamConstraints = {
        audio: false,
        video: true,
      }

      try {
        const preferredStream = await navigator.mediaDevices.getUserMedia(preferredConstraints)

        if (cancelled) {
          preferredStream.getTracks().forEach((track) => track.stop())
          return
        }

        await attachStream(preferredStream)
        setCameraStatus('ready')
      } catch (preferredError) {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)

          if (cancelled) {
            fallbackStream.getTracks().forEach((track) => track.stop())
            return
          }

          await attachStream(fallbackStream)
          setCameraStatus('ready')
        } catch (fallbackError) {
          const error = fallbackError instanceof DOMException ? fallbackError : preferredError

          setCameraStatus('error')

          if (error instanceof DOMException) {
            if (error.name === 'NotAllowedError') {
              setErrorMessage('Camera access was denied. Please allow camera permission and reload.')
              return
            }

            if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
              setErrorMessage('No camera was found on this device.')
              return
            }
          }

          setErrorMessage('Unable to start the camera on this device.')
        }
      }
    }

    if (!browserSupportsCamera) {
      return
    }

    void startCamera()

    return () => {
      cancelled = true

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [browserSupportsCamera])

  useEffect(() => {
    if (!capturedImage) {
      return
    }

    if (skipNextAnalysisRef.current) {
      skipNextAnalysisRef.current = false
      return
    }

    const controller = new AbortController()

    const analyzeImage = async () => {
      setAnalysisStatus('loading')
      setAnalysisSummary('')
      setAnalysisSceneType('general')
      setContextualActions([])

      try {
        const response = await fetch('/api/analyze-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageDataUrl: capturedImage,
          }),
          signal: controller.signal,
        })

        const data = (await response.json()) as Partial<AnalysisResponse> & { error?: string }

        if (!response.ok) {
          throw new Error(data.error || defaultAnalysisError)
        }

        const nextSummary = typeof data.summary === 'string' ? data.summary : ''
        const nextSceneType = data.primarySceneType || 'general'
        const nextActions =
          Array.isArray(data.actions)
            ? [...data.actions].sort((left, right) => right.confidence - left.confidence).slice(0, 3)
            : []

        setAnalysisSummary(nextSummary)
        setAnalysisSceneType(nextSceneType)
        setContextualActions(nextActions)
        cachedObservationRef.current = {
          capturedAt: Date.now(),
          summary: nextSummary,
          sceneType: nextSceneType,
          contextualActions: nextActions,
          allowedActionIds: getAllowedActionIds(nextActions),
        }
        setAnalysisStatus('done')
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setAnalysisStatus('error')
        setAnalysisSceneType('general')
        console.error(error instanceof Error ? error.message : defaultAnalysisError)
      }
    }

    void analyzeImage()

    return () => {
      controller.abort()
    }
  }, [capturedImage])

  const fallbackSummary = getFallbackSummary(analysisStatus, analysisSummary)
  const fallbackActions = useMemo(() => buildFallbackActions(fallbackSummary), [fallbackSummary])
  const displayedActions: DisplayAction[] = useMemo(
    () => [...contextualActions, ...fallbackActions],
    [contextualActions, fallbackActions],
  )
  const allowedActionIds = useMemo(
    () => getAllowedActionIds(contextualActions),
    [contextualActions],
  )

  function applyRecommendationParams(nextRecommendation: RecommendationResponse) {
    if (nextRecommendation.recommended_action_type === 'TRANSLATE') {
      const targetLanguage = getRecommendedParamString(nextRecommendation, 'targetLanguage')
      if (targetLanguage) {
        setTranslateLanguage(targetLanguage)
      }
    }

    if (nextRecommendation.recommended_action_type === 'ASK') {
      const question = getRecommendedParamString(nextRecommendation, 'question')
      if (question) {
        setAskQuestion(question)
      }
    }
  }

  function applyPresetParams(preset: SavedActionPreset) {
    if (preset.actionType === 'TRANSLATE') {
      const targetLanguage = getStringParam(preset.params, 'targetLanguage')
      if (targetLanguage) {
        setTranslateLanguage(targetLanguage)
      }
      setCustomTranslation(getStringParam(preset.params, 'translation') || '')
      setTranslateStatus('idle')
    }

    if (preset.actionType === 'ASK') {
      const question = getStringParam(preset.params, 'question')
      if (question) {
        setAskQuestion(question)
      }
      setAskAnswer(getStringParam(preset.params, 'answer') || '')
      setAskStatus('idle')
    }
  }

  function rememberLatestActionPreset(action: DisplayAction, extraParams: Record<string, unknown> = {}) {
    latestActionPresetRef.current = buildActionPreset({
      action,
      summary: fallbackSummary,
      contextualActions,
      recommendation: action.type === recommendationTargetType ? recommendation : null,
      askQuestion,
      askAnswer,
      translateLanguage,
      customTranslation,
      extraParams,
    })
  }

  function getCurrentActionPreset() {
    if (selectedAction) {
      rememberLatestActionPreset(selectedAction)
    }

    return latestActionPresetRef.current
  }

  function saveNumberPreset(numberKey: string, preset: SavedActionPreset) {
    const nextPreset = {
      ...preset,
      savedAt: Date.now(),
    }
    savedActionPresetsRef.current = {
      ...savedActionPresetsRef.current,
      [numberKey]: nextPreset,
    }
    saveSavedActionPresets(savedActionPresetsRef.current)
    setActionFeedback(`Saved ${nextPreset.label} to ${formatPresetKeyLabel(numberKey)}.`)
  }

  useEffect(() => {
    if (!capturedImage || captureIntent !== 'recommend') {
      return
    }

    if (analysisStatus === 'loading' || recommendationStatus !== 'waiting-actions') {
      return
    }

    const currentEpisodeId = episodeId

    if (!currentEpisodeId) {
      return
    }

    const controller = new AbortController()
    const observation = buildRlObservation({
      sceneType: analysisSceneType,
      summary: fallbackSummary,
      actions: contextualActions,
      allowedActionIds,
    })

    const fetchRecommendation = async () => {
      setRecommendationStatus('loading')
      setRecommendationError('')

      try {
        const response = await requestRecommendation({
          episode_id: currentEpisodeId,
          observation,
        })

        if (controller.signal.aborted) {
          return
        }

        if (bypassRecommendationRef.current) {
          return
        }

        const allowedSet = new Set(allowedActionIds)
        const safeResponse = allowedSet.has(response.recommended_action_id)
          ? response
          : {
            ...response,
            recommended_action_id: getFallbackActionId(allowedActionIds),
            recommended_action_type:
              ACTION_ID_TO_TYPE[getFallbackActionId(allowedActionIds) as keyof typeof ACTION_ID_TO_TYPE],
            recommended_params: {},
            policy_debug: {
              ...response.policy_debug,
              warning: 'Frontend replaced an invalid recommendation with a safe fallback.',
              },
            }

        setRecommendation(safeResponse)
        applyRecommendationParams(safeResponse)
        setRecommendationStatus('done')

        if (autoOpenRecommendedSheet) {
          const match = displayedActions.find((action) => action.type === safeResponse.recommended_action_type)
          if (match) {
            window.setTimeout(() => {
              setSelectedAction(match)
            }, 180)
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setRecommendationStatus('error')
        setRecommendationError(error instanceof Error ? error.message : 'Could not get a learned suggestion.')
      }
    }

    void fetchRecommendation()

    return () => {
      controller.abort()
    }
  }, [
    allowedActionIds,
    analysisSceneType,
    analysisStatus,
    captureIntent,
    contextualActions,
    displayedActions,
    episodeId,
    fallbackSummary,
    capturedImage,
    recommendationStatus,
  ])

  const isCapturedMode = capturedImage !== null
  const isBusy =
    analysisStatus === 'loading' ||
    recommendationStatus === 'waiting-actions' ||
    recommendationStatus === 'loading'
  const recommendationTargetType = recommendation?.recommended_action_type || null

  const resetInteractiveActionState = () => {
    setAskQuestion('')
    setAskAnswer('')
    setAskStatus('idle')
    setTranslateLanguage('')
    setCustomTranslation('')
    setTranslateStatus('idle')
  }

  const handleCapture = (intent: CaptureIntent) => {
    if (!videoRef.current || !canvasRef.current || cameraStatus !== 'ready') {
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return
    }

    const nextEpisodeId = createEpisodeId()
    const cachedObservation = getReusableObservation(cachedObservationRef.current)
    bypassRecommendationRef.current = false

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    feedbackSentRef.current = false
    setCaptureIntent(intent)
    setEpisodeId(nextEpisodeId)
    setRecommendation(null)
    setRecommendationError('')
    setSelectedAction(null)
    setActionFeedback('')
    resetInteractiveActionState()
    setLastRewardSent(null)

    if (intent === 'recommend' && cachedObservation) {
      skipNextAnalysisRef.current = true
      setAnalysisStatus('done')
      setAnalysisSummary(cachedObservation.summary)
      setAnalysisSceneType(cachedObservation.sceneType)
      setContextualActions(cachedObservation.contextualActions)
      setRecommendationStatus('waiting-actions')
    } else {
      setAnalysisStatus('loading')
      setAnalysisSummary('')
      setAnalysisSceneType('general')
      setContextualActions([])
      setRecommendationStatus(intent === 'recommend' ? 'waiting-actions' : 'idle')
    }

    setCapturedImage(canvas.toDataURL('image/jpeg', 0.92))
  }

  const submitRecommendationFeedback = async (chosenAction: DisplayAction | null) => {
    if (!episodeId || feedbackSentRef.current || !chosenAction) {
      return
    }

    const chosenActionId = ACTION_TYPE_TO_ID[chosenAction.type]
    const observation = buildRlObservation({
      sceneType: analysisSceneType,
      summary: fallbackSummary,
      actions: contextualActions,
      allowedActionIds,
    })

    const isRecommendationEpisode = captureIntent === 'recommend' && recommendation !== null
    const accepted = isRecommendationEpisode
      ? chosenActionId === recommendation.recommended_action_id
      : true
    const reward = isRecommendationEpisode
      ? getFeedbackReward({
          recommendedActionId: recommendation.recommended_action_id,
          chosenActionId,
          allowedActionIds,
          cancelled: false,
        })
      : 1

    const payload: FeedbackRequest = {
      episode_id: episodeId,
      source: isRecommendationEpisode ? 'recommendation' : 'manual',
      recommended_action_id: isRecommendationEpisode ? recommendation.recommended_action_id : null,
      chosen_action_id: chosenActionId,
      recommended_params: isRecommendationEpisode ? recommendation.recommended_params : null,
      chosen_params: getChosenActionParams(chosenAction, recommendation),
      accepted,
      reward,
      allowed_action_ids: allowedActionIds,
      observation,
    }

    feedbackSentRef.current = true
    setLastRewardSent(reward)

    try {
      await sendRecommendationFeedback(payload)
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Could not save recommendation feedback.')
    }
  }

  const submitRecommendationCancelFeedback = async () => {
    if (!episodeId || !recommendation || feedbackSentRef.current) {
      return
    }

    const reward = getFeedbackReward({
      recommendedActionId: recommendation.recommended_action_id,
      chosenActionId: null,
      allowedActionIds,
      cancelled: true,
    })

    const payload: FeedbackRequest = {
      episode_id: episodeId,
      source: 'recommendation',
      recommended_action_id: recommendation.recommended_action_id,
      chosen_action_id: null,
      accepted: false,
      reward,
      allowed_action_ids: allowedActionIds,
      observation: buildRlObservation({
        sceneType: analysisSceneType,
        summary: fallbackSummary,
        actions: contextualActions,
        allowedActionIds,
      }),
    }

    feedbackSentRef.current = true
    setLastRewardSent(reward)

    try {
      await sendRecommendationFeedback(payload)
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Could not save recommendation feedback.')
    }
  }

  const handleCancelCapture = () => {
    if (captureIntent === 'recommend') {
      void submitRecommendationCancelFeedback()
    }
    setAnalysisStatus('idle')
    setAnalysisSummary('')
    setAnalysisSceneType('general')
    setContextualActions([])
    setRecommendation(null)
    setRecommendationError('')
    setRecommendationStatus('idle')
    setSelectedAction(null)
    setActionFeedback('')
    resetInteractiveActionState()
    setCapturedImage(null)
    setEpisodeId(null)
    setLastRewardSent(null)
    feedbackSentRef.current = false
  }

  const handleActionPress = (action: DisplayAction, preset: SavedActionPreset | null = null) => {
    if (!canRunProcessedAction(action, analysisStatus)) {
      setActionFeedback('Image analysis is still finishing.')
      return
    }

    setActionFeedback('')
    rememberLatestActionPreset(action)
    void submitRecommendationFeedback(action)

    if (action.type === 'SEARCH') {
      window.open(
        buildSearchUrl(
          fallbackSummary,
          contextualActions,
          getStringParam(preset?.params ?? {}, 'query') ||
            (recommendationTargetType === 'SEARCH' ? getRecommendedParamString(recommendation, 'query') : null),
        ),
        '_blank',
        'noopener,noreferrer',
      )
      return
    }

    if (action.type === 'OPEN_LINK') {
      window.open(
        getStringParam(preset?.params ?? {}, 'url') ||
        (recommendationTargetType === 'OPEN_LINK'
          ? getRecommendedParamString(recommendation, 'url') || action.payload.url
          : action.payload.url),
        '_blank',
        'noopener,noreferrer',
      )
      return
    }

    resetInteractiveActionState()
    if (preset) {
      applyPresetParams(preset)
    } else if (action.type === recommendationTargetType && recommendation) {
      applyRecommendationParams(recommendation)
    }
    setSelectedAction(action)
  }

  const handleSavedPresetSelect = (preset: SavedActionPreset) => {
    const action = displayedActions.find((displayedAction) => displayedAction.type === preset.actionType)

    if (!action || !canRunProcessedAction(action, analysisStatus)) {
      setRecommendationError('Saved action is not available for this image.')
      return
    }

    if (captureIntent === 'recommend') {
      bypassRecommendationRef.current = true
      setRecommendation(null)
      setRecommendationError('')
      setRecommendationStatus('idle')
    }

    handleActionPress(action, preset)
  }

  const handleNumberPresetKey = useEffectEvent((event: KeyboardEvent) => {
    if (isControlKey(event)) {
      if (!capturedImage || captureIntent !== 'recommend' || selectedAction) {
        return
      }

      const preset = latestActionPresetRef.current
      if (!preset) {
        return
      }

      event.preventDefault()
      handleSavedPresetSelect(preset)
      return
    }

    if (isBacktickKey(event)) {
      if (shouldIgnoreNumpadSave(event)) {
        return
      }

      const preset = getCurrentActionPreset()
      if (!preset) {
        return
      }

      event.preventDefault()
      saveNumberPreset('`', preset)
      return
    }

    if (isEscapeKey(event)) {
      if (!capturedImage || captureIntent !== 'recommend' || selectedAction) {
        return
      }

      const preset = savedActionPresetsRef.current['`']
      if (!preset) {
        return
      }

      event.preventDefault()
      handleSavedPresetSelect(preset)
      return
    }

    const numberKey = getNumberKey(event)

    if (!numberKey) {
      return
    }

    if (numberKey.source === 'numpad') {
      if (shouldIgnoreNumpadSave(event)) {
        return
      }

      const preset = getCurrentActionPreset()
      if (!preset) {
        return
      }

      event.preventDefault()
      saveNumberPreset(numberKey.value, preset)
      return
    }

    if (numberKey.source !== 'top-row') {
      return
    }

    if (!capturedImage || captureIntent !== 'recommend' || selectedAction) {
      return
    }

    const preset = savedActionPresetsRef.current[numberKey.value]
    if (!preset) {
      return
    }

    event.preventDefault()
    handleSavedPresetSelect(preset)
  })

  const handleModalAction = async () => {
    if (!selectedAction) {
      return
    }

    try {
      switch (selectedAction.type) {
        case 'TRANSLATE':
          await navigator.clipboard.writeText(customTranslation || selectedAction.payload.translatedText)
          setActionFeedback('Translation copied.')
          break
        case 'OPEN_LINK':
          window.open(selectedAction.payload.url, '_blank', 'noopener,noreferrer')
          setActionFeedback('Link opened in a new tab.')
          break
        case 'SOLVE':
          await navigator.clipboard.writeText(
            [
              selectedAction.payload.solutionSummary,
              ...selectedAction.payload.steps,
              selectedAction.payload.finalAnswer,
            ].join('\n'),
          )
          setActionFeedback('Solution copied.')
          break
        case 'ADD_CONTACT':
          downloadTextFile('contact.vcf', buildVCard(selectedAction.payload), 'text/vcard')
          setActionFeedback('vCard downloaded.')
          break
        case 'SAVE_EXPENSE':
          downloadTextFile(
            'expense.json',
            JSON.stringify(selectedAction.payload, null, 2),
            'application/json',
          )
          setActionFeedback('Expense JSON downloaded.')
          break
        case 'SET_REMINDER':
          downloadTextFile(
            'reminder.ics',
            buildReminderICS(selectedAction.payload),
            'text/calendar',
          )
          setActionFeedback('Reminder .ics downloaded.')
          break
        case 'ADD_EVENT':
          downloadTextFile('event.ics', buildEventICS(selectedAction.payload), 'text/calendar')
          setActionFeedback('Event .ics downloaded.')
          break
        case 'ASK':
        case 'SEARCH':
          setActionFeedback('This fallback action is preview-only right now.')
          break
      }
    } catch {
      setActionFeedback('That action could not be completed on this device.')
    }
  }

  const handleAskSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!capturedImage || !askQuestion.trim()) {
      return
    }

    setAskStatus('loading')
    setAskAnswer('')
    setActionFeedback('')

    try {
      const response = await fetch('/api/ask-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageDataUrl: capturedImage,
          question: askQuestion.trim(),
          summary: analysisSummary,
        }),
      })
      const data = (await response.json()) as { answer?: string; error?: string }

      if (!response.ok) {
        throw new Error(data.error || 'Could not answer that question.')
      }

      setAskAnswer(data.answer || 'No answer returned.')
      setAskStatus('done')
      if (selectedAction) {
        rememberLatestActionPreset(selectedAction, {
          question: askQuestion.trim(),
          answer: data.answer || '',
        })
      }
    } catch (error) {
      setAskStatus('error')
      setAskAnswer(error instanceof Error ? error.message : 'Could not answer that question.')
    }
  }

  const handleTranslateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!capturedImage || !translateLanguage.trim() || !selectedAction || selectedAction.type !== 'TRANSLATE') {
      return
    }

    setTranslateStatus('loading')
    setCustomTranslation('')
    setActionFeedback('')

    try {
      const response = await fetch('/api/translate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageDataUrl: capturedImage,
          targetLanguage: translateLanguage.trim(),
          detectedText: selectedAction.payload.detectedText,
          summary: analysisSummary,
        }),
      })
      const data = (await response.json()) as { translation?: string; error?: string }

      if (!response.ok) {
        throw new Error(data.error || 'Could not translate the image text.')
      }

      setCustomTranslation(data.translation || 'No translation returned.')
      setTranslateStatus('done')
      if (selectedAction) {
        rememberLatestActionPreset(selectedAction, {
          targetLanguage: translateLanguage.trim(),
          translation: data.translation || '',
        })
      }
    } catch (error) {
      setTranslateStatus('error')
      setCustomTranslation(error instanceof Error ? error.message : 'Could not translate the image text.')
    }
  }

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  const handleShutterPointerDown = () => {
    if (cameraStatus !== 'ready') {
      return
    }

    longPressTriggeredRef.current = false
    setIsShutterHolding(true)
    clearHoldTimer()

    holdTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true
      setIsShutterHolding(false)
      handleCapture('recommend')
    }, holdToRecommendMs)
  }

  const handleShutterPointerUp = () => {
    const shouldRunNormalCapture =
      cameraStatus === 'ready' && !longPressTriggeredRef.current && holdTimerRef.current !== null

    clearHoldTimer()
    setIsShutterHolding(false)

    if (shouldRunNormalCapture) {
      handleCapture('manual')
    }
  }

  const handleShutterPointerCancel = () => {
    clearHoldTimer()
    longPressTriggeredRef.current = false
    setIsShutterHolding(false)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.altKey || (event.ctrlKey && !isControlKey(event))) {
        return
      }

      handleNumberPresetKey(event)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="iPhone camera demo">
        <div className="phone-bezel">
          <div className="dynamic-island" aria-hidden="true" />

          <div className="camera-screen">
            <video
              ref={videoRef}
              className={`camera-media${isCapturedMode ? ' camera-media-hidden' : ''}`}
              autoPlay
              muted
              playsInline
            />

            {capturedImage && (
              <img
                className="camera-media captured-preview"
                src={capturedImage}
                alt="Captured camera frame"
              />
            )}

            <div className="camera-overlay">
              <div
                className={`bottom-gradient${isCapturedMode ? ' bottom-gradient-captured' : ''}${selectedAction ? ' bottom-gradient-modal' : ''}`}
              />

              {cameraStatus !== 'ready' && (
                <div className="status-panel" role={cameraStatus === 'error' ? 'alert' : 'status'}>
                  <p className="status-title">
                    {cameraStatus === 'loading' ? 'Starting camera…' : 'Camera unavailable'}
                  </p>
                  {errorMessage && <p className="status-message">{errorMessage}</p>}
                </div>
              )}

              {isCapturedMode ? (
                <div className="captured-controls">
                  <div className="captured-actions">
                    {displayedActions.map((action) => {
                      const isRecommended = action.type === recommendationTargetType
                      const isActionReady = canRunProcessedAction(action, analysisStatus)
                      return (
                        <button
                          key={`${action.type}-${action.label}`}
                          type="button"
                          className={`action-pill${isContextualAction(action) ? ' action-pill-contextual' : ''}${isRecommended ? ' recommended-action' : ''}`}
                          onClick={() => handleActionPress(action)}
                          disabled={!isActionReady}
                        >
                          <ActionIcon actionType={action.type} className="pill-icon" />
                          <span>{action.label}</span>
                          {isRecommended && <span className="recommended-badge">Recommended</span>}
                        </button>
                      )
                    })}
                  </div>

                  {recommendationError && captureIntent === 'recommend' && (
                    <p className="recommendation-message">{recommendationError}</p>
                  )}

                  <button
                    type="button"
                    className={`cancel-button${isBusy ? ' cancel-button-loading' : ''}`}
                    onClick={handleCancelCapture}
                    aria-label={
                      captureIntent === 'recommend'
                        ? 'Close suggested capture'
                        : 'Close captured image'
                    }
                  >
                    {isBusy && (
                      <>
                        <span className="cancel-button-orbit" aria-hidden="true" />
                        <span className="cancel-button-glow" aria-hidden="true" />
                      </>
                    )}
                    {captureIntent === 'recommend' ? (
                      <BrainIcon className="cancel-button-icon" />
                    ) : (
                      <span className="cancel-button-x" aria-hidden="true">
                        ×
                      </span>
                    )}
                  </button>

                  {showRlDebugUi && (
                    <>
                      <button
                        type="button"
                        className="debug-toggle"
                        onClick={() => setDebugVisible((value) => !value)}
                      >
                        {debugVisible ? 'Hide Debug' : 'Show Debug'}
                      </button>

                      {debugVisible && (
                        <div className="debug-panel">
                          <DebugRow
                            label="Allowed"
                            value={allowedActionIds
                              .map((id) => ACTION_ID_TO_TYPE[id as keyof typeof ACTION_ID_TO_TYPE])
                              .join(', ')}
                          />
                          <DebugRow
                            label="Recommended"
                            value={
                              recommendation
                                ? `${recommendation.recommended_action_type} (${Math.round(recommendation.confidence * 100)}%)`
                                : captureIntent === 'recommend'
                                  ? recommendationStatus
                                  : 'None'
                            }
                          />
                          <DebugRow
                            label="Reward"
                            value={lastRewardSent === null ? 'None sent yet' : String(lastRewardSent)}
                          />
                          <DebugRow
                            label="Checkpoint"
                            value={recommendation?.policy_debug.checkpoint || 'Not loaded yet'}
                          />
                          <DebugRow
                            label="Replay"
                            value={
                              recommendation?.policy_debug.replay_size === undefined
                                ? 'Unknown'
                                : String(recommendation.policy_debug.replay_size)
                            }
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="live-controls">
                  <button type="button" className="side-control ask-control" aria-label="Ask" disabled>
                    <span className="side-control-icon" aria-hidden="true">
                      <AskIcon className="control-icon-svg" />
                    </span>
                    <span className="side-control-label">Ask</span>
                  </button>

                  <div className="shutter-cluster">
                    <button
                      type="button"
                      className={`shutter-button${isShutterHolding ? ' shutter-button-holding' : ''}`}
                      onPointerDown={handleShutterPointerDown}
                      onPointerUp={handleShutterPointerUp}
                      onPointerLeave={handleShutterPointerCancel}
                      onPointerCancel={handleShutterPointerCancel}
                      onContextMenu={(event) => event.preventDefault()}
                      aria-label="Take picture"
                      disabled={cameraStatus !== 'ready'}
                    >
                      {isShutterHolding && (
                        <>
                          <span className="shutter-button-orbit" aria-hidden="true" />
                          <span className="shutter-button-glow" aria-hidden="true" />
                        </>
                      )}
                      <span className="shutter-button-inner" />
                    </button>
                  </div>

                  <button type="button" className="side-control search-control" aria-label="Search" disabled>
                    <span className="side-control-icon" aria-hidden="true">
                      <SearchIcon className="control-icon-svg" />
                    </span>
                    <span className="side-control-label">Search</span>
                  </button>
                </div>
              )}

              {selectedAction && (
                <div className="modal-scrim" onClick={() => setSelectedAction(null)}>
                  <div
                    className="action-sheet"
                    role="dialog"
                    aria-modal="true"
                    aria-label={selectedAction.label}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="action-sheet-header">
                      <div className="action-sheet-title-wrap">
                        <ActionIcon actionType={selectedAction.type} className="sheet-icon" />
                        <div>
                          <h2 className="action-sheet-title">{selectedAction.label}</h2>
                          {isContextualAction(selectedAction) ? (
                            <p className="action-sheet-subtitle">
                              Confidence {Math.round(selectedAction.confidence * 100)}%
                            </p>
                          ) : (
                            recommendationTargetType === selectedAction.type && (
                              <p className="action-sheet-subtitle">Learned suggestion</p>
                            )
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="sheet-close"
                        onClick={() => setSelectedAction(null)}
                        aria-label="Close action preview"
                      >
                        ×
                      </button>
                    </div>

                    <div className="action-sheet-body">
                      {selectedAction.type === 'ASK' ? (
                        <AskPayload
                          question={askQuestion}
                          answer={askAnswer}
                          status={askStatus}
                          onQuestionChange={setAskQuestion}
                          onSubmit={handleAskSubmit}
                        />
                      ) : selectedAction.type === 'TRANSLATE' ? (
                        <TranslatePayload
                          action={selectedAction}
                          language={translateLanguage}
                          translation={customTranslation}
                          status={translateStatus}
                          onLanguageChange={setTranslateLanguage}
                          onSubmit={handleTranslateSubmit}
                        />
                      ) : !isContextualAction(selectedAction) ? (
                        <FallbackPayload action={selectedAction} />
                      ) : (
                        renderActionPayload(selectedAction)
                      )}
                    </div>

                    {actionFeedback && <p className="action-feedback">{actionFeedback}</p>}

                    <div className="action-sheet-footer">
                      {getActionButtonLabel(selectedAction) && (
                        <button type="button" className="sheet-primary" onClick={handleModalAction}>
                          {getActionButtonLabel(selectedAction)}
                        </button>
                      )}
                      <button type="button" className="sheet-secondary" onClick={() => setSelectedAction(null)}>
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="home-indicator" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true" />
    </main>
  )
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="debug-row">
      <span className="debug-key">{label}</span>
      <span className="debug-value">{value}</span>
    </div>
  )
}

function AskPayload({
  question,
  answer,
  status,
  onQuestionChange,
  onSubmit,
}: {
  question: string
  answer: string
  status: 'idle' | 'loading' | 'done' | 'error'
  onQuestionChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="payload-form" onSubmit={onSubmit}>
      <label className="payload-field">
        <span className="payload-key">Question</span>
        <textarea
          className="payload-input payload-textarea"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder="Ask something about this image"
          rows={3}
        />
      </label>
      <button type="submit" className="sheet-primary sheet-inline-button" disabled={status === 'loading' || !question.trim()}>
        {status === 'loading' ? 'Answering...' : 'Ask'}
      </button>
      {(answer || status === 'loading') && (
        <div className="payload-row payload-row-block">
          <span className="payload-key">Answer</span>
          <span className={`payload-value payload-value-left${status === 'error' ? ' payload-error' : ''}`}>
            {status === 'loading' ? 'Thinking through the image...' : answer}
          </span>
        </div>
      )}
    </form>
  )
}

function TranslatePayload({
  action,
  language,
  translation,
  status,
  onLanguageChange,
  onSubmit,
}: {
  action: Extract<ContextualAction, { type: 'TRANSLATE' }>
  language: string
  translation: string
  status: 'idle' | 'loading' | 'done' | 'error'
  onLanguageChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="payload-form" onSubmit={onSubmit}>
      <PayloadRow label="Detected Text" value={action.payload.detectedText} />
      <label className="payload-field">
        <span className="payload-key">Language</span>
        <input
          className="payload-input"
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
          placeholder="English, Spanish, Chinese..."
        />
      </label>
      <button type="submit" className="sheet-primary sheet-inline-button" disabled={status === 'loading' || !language.trim()}>
        {status === 'loading' ? 'Translating...' : 'Translate'}
      </button>
      {(translation || status === 'loading') && (
        <div className="payload-row payload-row-block">
          <span className="payload-key">Translation</span>
          <span className={`payload-value payload-value-left${status === 'error' ? ' payload-error' : ''}`}>
            {status === 'loading' ? 'Reading and translating the visible text...' : translation}
          </span>
        </div>
      )}
    </form>
  )
}

function FallbackPayload({ action }: { action: FallbackAction }) {
  return (
    <div className="payload-stack">
      <PayloadRow label={action.label} value="Ready." />
    </div>
  )
}

function ActionIcon({
  actionType,
  className,
}: {
  actionType: ContextualActionType | FallbackActionType
  className: string
}) {
  switch (actionType) {
    case 'TRANSLATE':
      return <TranslateIcon className={className} />
    case 'OPEN_LINK':
      return <LinkIcon className={className} />
    case 'SOLVE':
      return <SolveIcon className={className} />
    case 'ADD_CONTACT':
      return <ContactIcon className={className} />
    case 'SAVE_EXPENSE':
      return <ExpenseIcon className={className} />
    case 'SET_REMINDER':
      return <ReminderIcon className={className} />
    case 'ADD_EVENT':
      return <EventIcon className={className} />
    case 'ASK':
      return <AskIcon className={className} />
    case 'SEARCH':
      return <SearchIcon className={className} />
  }
}

function isContextualAction(action: DisplayAction): action is ContextualAction {
  return 'confidence' in action
}

function buildFallbackActions(summary: string): FallbackAction[] {
  return [
    {
      type: 'ASK',
      label: 'Ask',
      payload: {
        summary,
      },
    },
    {
      type: 'SEARCH',
      label: 'Search',
      payload: {
        summary,
      },
    },
  ]
}

function getFallbackSummary(status: AnalysisStatus, summary: string) {
  const normalizedSummary = summary.trim()

  if (normalizedSummary) {
    return normalizedSummary
  }

  if (status === 'loading') {
    return 'Still analyzing the captured image.'
  }

  if (status === 'error') {
    return 'Could not analyze this image.'
  }

  if (status === 'done') {
    return 'Nothing notable was detected in this image.'
  }

  return 'Captured image ready for Ask or Search.'
}

function getAllowedActionIds(actions: ContextualAction[]) {
  const ids = new Set<number>([ACTION_TYPE_TO_ID.ASK, ACTION_TYPE_TO_ID.SEARCH])

  actions.forEach((action) => {
    ids.add(ACTION_TYPE_TO_ID[action.type])
  })

  return [...ids].sort((left, right) => left - right)
}

function getFallbackActionId(allowedActionIds: number[]) {
  const priority = [
    ACTION_TYPE_TO_ID.ADD_EVENT,
    ACTION_TYPE_TO_ID.SAVE_EXPENSE,
    ACTION_TYPE_TO_ID.SET_REMINDER,
    ACTION_TYPE_TO_ID.ADD_CONTACT,
    ACTION_TYPE_TO_ID.SOLVE,
    ACTION_TYPE_TO_ID.TRANSLATE,
    ACTION_TYPE_TO_ID.OPEN_LINK,
    ACTION_TYPE_TO_ID.SEARCH,
    ACTION_TYPE_TO_ID.ASK,
  ]

  return priority.find((id) => allowedActionIds.includes(id)) ?? ACTION_TYPE_TO_ID.SEARCH
}

function buildRlObservation({
  sceneType,
  summary,
  actions,
  allowedActionIds,
}: {
  sceneType: PrimarySceneType
  summary: string
  actions: ContextualAction[]
  allowedActionIds: number[]
}): RLObservation {
  return {
    scene_type: sceneType,
    summary,
    actions,
    allowed_action_ids: allowedActionIds,
    image_features: null,
  }
}

function getFeedbackReward({
  recommendedActionId,
  chosenActionId,
  allowedActionIds,
  cancelled,
}: {
  recommendedActionId: number
  chosenActionId: number | null
  allowedActionIds: number[]
  cancelled: boolean
}) {
  if (!allowedActionIds.includes(recommendedActionId)) {
    return -1
  }

  if (cancelled) {
    return -0.5
  }

  if (chosenActionId === recommendedActionId) {
    return 1
  }

  return -0.2
}

function getReusableObservation(cachedObservation: CachedObservation | null) {
  if (!cachedObservation) {
    return null
  }

  if (Date.now() - cachedObservation.capturedAt > recentObservationReuseWindowMs) {
    return null
  }

  return cachedObservation
}

function canRunProcessedAction(_action: DisplayAction, status: AnalysisStatus) {
  return status === 'done'
}

function loadSavedActionPresets(): Record<string, SavedActionPreset> {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const rawValue = window.localStorage.getItem(savedActionPresetsKey)
    if (!rawValue) {
      return {}
    }

    const parsedValue = JSON.parse(rawValue)
    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsedValue).filter((entry): entry is [string, SavedActionPreset] => {
        const [key, value] = entry
        return (/^\d$/.test(key) || key === '`') && isSavedActionPreset(value)
      }),
    )
  } catch {
    return {}
  }
}

function saveSavedActionPresets(presets: Record<string, SavedActionPreset>) {
  window.localStorage.setItem(savedActionPresetsKey, JSON.stringify(presets))
}

function isSavedActionPreset(value: unknown): value is SavedActionPreset {
  if (!value || typeof value !== 'object') {
    return false
  }

  const preset = value as SavedActionPreset
  return (
    typeof preset.actionType === 'string' &&
    preset.actionType in ACTION_TYPE_TO_ID &&
    typeof preset.label === 'string' &&
    typeof preset.savedAt === 'number' &&
    Boolean(preset.params) &&
    typeof preset.params === 'object' &&
    !Array.isArray(preset.params)
  )
}

function getNumberKey(event: KeyboardEvent) {
  if (/^Numpad\d$/.test(event.code)) {
    return {
      source: 'numpad' as const,
      value: event.code.replace('Numpad', ''),
    }
  }

  if (/^Digit\d$/.test(event.code)) {
    return {
      source: 'top-row' as const,
      value: event.code.replace('Digit', ''),
    }
  }

  return null
}

function isControlKey(event: KeyboardEvent) {
  return event.key === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight'
}

function isBacktickKey(event: KeyboardEvent) {
  return event.code === 'Backquote' || event.key === '`'
}

function isEscapeKey(event: KeyboardEvent) {
  return event.key === 'Escape' || event.code === 'Escape'
}

function formatPresetKeyLabel(value: string) {
  return value === '`' ? '`' : value
}

function shouldIgnoreNumpadSave(event: KeyboardEvent) {
  return event.isComposing || event.repeat
}

function getStringParam(params: Record<string, unknown>, key: string) {
  const value = params[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function buildActionPreset({
  action,
  summary,
  contextualActions,
  recommendation,
  askQuestion,
  askAnswer,
  translateLanguage,
  customTranslation,
  extraParams,
}: {
  action: DisplayAction
  summary: string
  contextualActions: ContextualAction[]
  recommendation: RecommendationResponse | null
  askQuestion: string
  askAnswer: string
  translateLanguage: string
  customTranslation: string
  extraParams: Record<string, unknown>
}): SavedActionPreset {
  return {
    actionType: action.type,
    label: buildActionPresetLabel(action, {
      translateLanguage,
      askQuestion,
      recommendation,
    }),
    params: {
      ...buildActionPresetParams(action, {
        summary,
        contextualActions,
        recommendation,
        askQuestion,
        askAnswer,
        translateLanguage,
        customTranslation,
      }),
      ...extraParams,
    },
    savedAt: Date.now(),
  }
}

function buildActionPresetLabel(
  action: DisplayAction,
  {
    translateLanguage,
    askQuestion,
    recommendation,
  }: {
    translateLanguage: string
    askQuestion: string
    recommendation: RecommendationResponse | null
  },
) {
  if (action.type === 'TRANSLATE') {
    const targetLanguage =
      translateLanguage.trim() || getRecommendedParamString(recommendation, 'targetLanguage')
    return targetLanguage ? `Translate - ${targetLanguage}` : 'Translate'
  }

  if (action.type === 'ASK') {
    return askQuestion.trim() ? `Ask - ${truncateLabel(askQuestion.trim())}` : 'Ask'
  }

  return action.label
}

function buildActionPresetParams(
  action: DisplayAction,
  {
    summary,
    contextualActions,
    recommendation,
    askQuestion,
    askAnswer,
    translateLanguage,
    customTranslation,
  }: {
    summary: string
    contextualActions: ContextualAction[]
    recommendation: RecommendationResponse | null
    askQuestion: string
    askAnswer: string
    translateLanguage: string
    customTranslation: string
  },
) {
  if (action.type === 'TRANSLATE') {
    return {
      targetLanguage:
        translateLanguage.trim() ||
        getRecommendedParamString(recommendation, 'targetLanguage') ||
        'English',
      translation: customTranslation,
    }
  }

  if (action.type === 'ASK') {
    return {
      question: askQuestion.trim() || getRecommendedParamString(recommendation, 'question') || '',
      answer: askAnswer,
    }
  }

  if (action.type === 'SEARCH') {
    return {
      query:
        getRecommendedParamString(recommendation, 'query') ||
        buildSearchQuery(summary, contextualActions),
    }
  }

  if (action.type === 'OPEN_LINK') {
    return {
      url: getRecommendedParamString(recommendation, 'url') || action.payload.url,
    }
  }

  return {
    payload: isContextualAction(action) ? action.payload : action.payload,
  }
}

function truncateLabel(value: string) {
  return value.length <= 28 ? value : `${value.slice(0, 27)}...`
}

function getRecommendedParamString(
  recommendation: RecommendationResponse | null,
  key: string,
) {
  const value = recommendation?.recommended_params?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getChosenActionParams(
  action: DisplayAction,
  recommendation: RecommendationResponse | null,
): Record<string, unknown> | null {
  if (recommendation?.recommended_action_type === action.type && recommendation.recommended_params) {
    return recommendation.recommended_params
  }

  return null
}

function buildSearchUrl(summary: string, actions: ContextualAction[], recommendedQuery: string | null = null) {
  if (recommendedQuery) {
    return `https://www.google.com/search?q=${encodeURIComponent(recommendedQuery)}`
  }

  return `https://www.google.com/search?q=${encodeURIComponent(buildSearchQuery(summary, actions) || 'visual search')}`
}

function buildSearchQuery(summary: string, actions: ContextualAction[]) {
  const actionText = actions
    .map((action) => {
      switch (action.type) {
        case 'OPEN_LINK':
          return action.payload.displayText || action.payload.url
        case 'TRANSLATE':
          return action.payload.detectedText
        case 'SOLVE':
          return action.payload.problemText
        case 'ADD_CONTACT':
          return joinNonEmpty([action.payload.name, action.payload.company, action.payload.website], ' ')
        case 'SAVE_EXPENSE':
          return joinNonEmpty([action.payload.merchant, action.payload.total, action.payload.category], ' ')
        case 'SET_REMINDER':
          return joinNonEmpty([action.payload.title, action.payload.dateTimeText], ' ')
        case 'ADD_EVENT':
          return joinNonEmpty([action.payload.title, action.payload.location, action.payload.date], ' ')
      }
    })
    .filter(Boolean)
    .join(' ')
  const query = actionText ? normalizeSearchQuery(actionText) : buildSubjectSearchQuery(summary)
  return query || 'visual search'
}

function normalizeSearchQuery(value: string | null) {
  return (value || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(no strong contextual action was detected|nothing notable was detected)\b/gi, '')
    .replace(/\bthere is no visible text or information that suggests any of the supported actions\.?/gi, '')
    .replace(/\bno visible text or information that suggests any of the supported actions\.?/gi, '')
    .replace(/\bthe image shows\b/gi, '')
    .replace(/\bthe image appears to show\b/gi, '')
    .replace(/\bappears to be\b/gi, 'is')
    .trim()
}

function buildSubjectSearchQuery(summary: string) {
  const cleaned = normalizeSearchQuery(summary)
  const firstSentence = cleaned
    .split(/[.!?]/)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.length > 0) || cleaned

  return firstSentence
    .replace(/\b(a|an|the)\s+/gi, '')
    .replace(/\b(seated|sitting)\s+in\s+(a\s+)?chair\b/gi, '')
    .replace(/\bbackground includes\b.*$/gi, '')
    .replace(/\bwith a door\b.*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getActionButtonLabel(action: DisplayAction) {
  switch (action.type) {
    case 'TRANSLATE':
      return 'Copy Translation'
    case 'OPEN_LINK':
      return 'Open Link'
    case 'SOLVE':
      return 'Copy Solution'
    case 'ADD_CONTACT':
      return 'Download vCard'
    case 'SAVE_EXPENSE':
      return 'Save JSON'
    case 'SET_REMINDER':
      return 'Download .ics'
    case 'ADD_EVENT':
      return 'Download .ics'
    case 'ASK':
    case 'SEARCH':
      return null
  }
}

function renderActionPayload(action: ContextualAction) {
  switch (action.type) {
    case 'TRANSLATE':
      return (
        <div className="payload-stack">
          <PayloadRow label="Source Language" value={action.payload.sourceLanguage} />
          <PayloadRow label="Detected Text" value={action.payload.detectedText} />
          <PayloadRow label="Translation" value={action.payload.translatedText} />
        </div>
      )
    case 'OPEN_LINK':
      return (
        <div className="payload-stack">
          <PayloadRow label="Display Text" value={action.payload.displayText} />
          <PayloadRow label="URL" value={action.payload.url} />
        </div>
      )
    case 'SOLVE':
      return (
        <div className="payload-stack">
          <PayloadRow label="Problem" value={action.payload.problemText} />
          <PayloadRow label="Summary" value={action.payload.solutionSummary} />
          <PayloadList label="Steps" values={action.payload.steps} />
          <PayloadRow label="Final Answer" value={action.payload.finalAnswer} />
        </div>
      )
    case 'ADD_CONTACT':
      return (
        <div className="payload-stack">
          <PayloadRow label="Name" value={action.payload.name} />
          <PayloadRow label="Company" value={action.payload.company} />
          <PayloadRow label="Phone" value={action.payload.phone} />
          <PayloadRow label="Email" value={action.payload.email} />
          <PayloadRow label="Website" value={action.payload.website} />
          <PayloadRow label="Address" value={action.payload.address} />
        </div>
      )
    case 'SAVE_EXPENSE':
      return (
        <div className="payload-stack">
          <PayloadRow label="Merchant" value={action.payload.merchant} />
          <PayloadRow label="Date" value={action.payload.date} />
          <PayloadRow label="Total" value={joinNonEmpty([action.payload.total, action.payload.currency], ' ')} />
          <PayloadRow label="Category" value={action.payload.category} />
          <PayloadObject
            label="Line Items"
            value={JSON.stringify(action.payload.lineItems, null, 2)}
          />
        </div>
      )
    case 'SET_REMINDER':
      return (
        <div className="payload-stack">
          <PayloadRow label="Title" value={action.payload.title} />
          <PayloadRow label="Reminder Text" value={action.payload.suggestedReminderText} />
          <PayloadRow label="Time" value={action.payload.dateTimeText} />
          <PayloadRow
            label="Relative Minutes"
            value={
              action.payload.relativeTimeMinutes === null
                ? null
                : String(action.payload.relativeTimeMinutes)
            }
          />
          <PayloadRow label="Reason" value={action.payload.reason} />
        </div>
      )
    case 'ADD_EVENT':
      return (
        <div className="payload-stack">
          <PayloadRow label="Title" value={action.payload.title} />
          <PayloadRow label="Date" value={action.payload.date} />
          <PayloadRow label="Start" value={action.payload.startTime} />
          <PayloadRow label="End" value={action.payload.endTime} />
          <PayloadRow label="Location" value={action.payload.location} />
          <PayloadRow label="Description" value={action.payload.description} />
        </div>
      )
  }
}

function PayloadRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="payload-row">
      <span className="payload-key">{label}</span>
      <span className="payload-value">{value || 'Unavailable'}</span>
    </div>
  )
}

function PayloadList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="payload-row payload-row-block">
      <span className="payload-key">{label}</span>
      <div className="payload-list">
        {values.length > 0 ? values.map((value, index) => <span key={index}>{value}</span>) : <span>Unavailable</span>}
      </div>
    </div>
  )
}

function PayloadObject({ label, value }: { label: string; value: string }) {
  return (
    <div className="payload-row payload-row-block">
      <span className="payload-key">{label}</span>
      <pre className="payload-code">{value}</pre>
    </div>
  )
}

function joinNonEmpty(values: Array<string | null>, separator: string) {
  const filtered = values.filter((value): value is string => Boolean(value))
  return filtered.length > 0 ? filtered.join(separator) : null
}

function downloadTextFile(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = filename
  anchor.click()

  URL.revokeObjectURL(objectUrl)
}

function buildVCard(payload: AddContactAction['payload']) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    payload.name ? `FN:${payload.name}` : null,
    payload.company ? `ORG:${payload.company}` : null,
    payload.phone ? `TEL;TYPE=CELL:${payload.phone}` : null,
    payload.email ? `EMAIL:${payload.email}` : null,
    payload.website ? `URL:${payload.website}` : null,
    payload.address ? `ADR:;;${payload.address}` : null,
    'END:VCARD',
  ].filter(Boolean)

  return lines.join('\n')
}

function buildEventICS(payload: AddEventAction['payload']) {
  const dtStart = createICSDate(payload.date, payload.startTime)
  const dtEnd = createICSDate(payload.date, payload.endTime)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Visint//Event Preview//EN',
    'BEGIN:VEVENT',
    `UID:${createEpisodeId()}@visint.local`,
    `DTSTAMP:${stamp}`,
    payload.title ? `SUMMARY:${escapeICS(payload.title)}` : null,
    dtStart ? `DTSTART:${dtStart}` : null,
    dtEnd ? `DTEND:${dtEnd}` : null,
    payload.location ? `LOCATION:${escapeICS(payload.location)}` : null,
    payload.description ? `DESCRIPTION:${escapeICS(payload.description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

function buildReminderICS(payload: SetReminderAction['payload']) {
  const dateText = payload.dateTimeText || new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const dtStart = createICSDate(dateText, null)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Visint//Reminder Preview//EN',
    'BEGIN:VEVENT',
    `UID:${createEpisodeId()}@visint.local`,
    `DTSTAMP:${stamp}`,
    `SUMMARY:${escapeICS(payload.title)}`,
    dtStart ? `DTSTART:${dtStart}` : null,
    `DESCRIPTION:${escapeICS(payload.suggestedReminderText)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

function createICSDate(date: string | null, time: string | null) {
  if (!date && !time) {
    return null
  }

  const combined = [date, time].filter(Boolean).join(' ').trim()
  const parsed = new Date(combined)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeICS(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function createEpisodeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `visint-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default App
