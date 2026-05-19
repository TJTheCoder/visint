import { useEffect, useRef, useState } from 'react'
import './App.css'

type CameraStatus = 'idle' | 'loading' | 'ready' | 'error'

function AskIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="10.5"
        cy="10.5"
        r="4.75"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M14.2 14.2 18.5 18.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)

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
        // Safari may defer playback until the stream is attached; the video
        // element remains ready to play as soon as the browser allows it.
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
          const error =
            fallbackError instanceof DOMException ? fallbackError : preferredError

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

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('error')
      setErrorMessage('This browser does not support camera access.')
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
  }, [])

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current || cameraStatus !== 'ready') {
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.92)

    // Stage 2 can plug into this captured frame for analysis or upload.
    setCapturedImage(imageDataUrl)
  }

  const handleCancelCapture = () => {
    setCapturedImage(null)
  }

  const isCapturedMode = capturedImage !== null

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
              <div className={`bottom-gradient${isCapturedMode ? ' bottom-gradient-captured' : ''}`} />

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
                    <button type="button" className="action-pill" disabled>
                      <AskIcon className="pill-icon" />
                      <span>Ask</span>
                    </button>

                    <button type="button" className="action-pill" disabled>
                      <SearchIcon className="pill-icon" />
                      <span>Search</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    className="cancel-button"
                    onClick={handleCancelCapture}
                    aria-label="Close captured image"
                  >
                    <span className="cancel-button-x" aria-hidden="true">
                      ×
                    </span>
                  </button>
                </div>
              ) : (
                <div className="live-controls">
                  <button
                    type="button"
                    className="side-control ask-control"
                    aria-label="Ask"
                    disabled
                  >
                    <span className="side-control-icon" aria-hidden="true">
                      <AskIcon className="control-icon-svg" />
                    </span>
                    <span className="side-control-label">Ask</span>
                  </button>

                  <button
                    type="button"
                    className="shutter-button"
                    onClick={handleCapture}
                    aria-label="Take picture"
                    disabled={cameraStatus !== 'ready'}
                  >
                    <span className="shutter-button-inner" />
                  </button>

                  <button
                    type="button"
                    className="side-control search-control"
                    aria-label="Search"
                    disabled
                  >
                    <span className="side-control-icon" aria-hidden="true">
                      <SearchIcon className="control-icon-svg" />
                    </span>
                    <span className="side-control-label">Search</span>
                  </button>
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

export default App
