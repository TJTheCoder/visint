import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { Jimp } from 'jimp'
import jsQR from 'jsqr'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createWorker } from 'tesseract.js'
import { z } from 'zod'

dotenv.config()

const port = Number(process.env.PORT || 3001)
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5vl:7b'
const ollamaBin = process.env.OLLAMA_BIN || join(homedir(), '.local', 'bin', 'ollama')
const minimumActionConfidence = 0.7

const systemPrompt =
  'You are the contextual action detection layer for a Visual Intelligence-style camera app. Analyze the image and return only JSON. Return only actions that are clearly supported by visible evidence. Do not hallucinate. If uncertain, omit the action or lower confidence. Prefer practical user actions over descriptions.'

const analysisJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'primarySceneType', 'actions'],
  properties: {
    summary: { type: 'string' },
    primarySceneType: {
      type: 'string',
      enum: ['event', 'receipt', 'contact', 'link', 'foreign_text', 'math', 'parking', 'general'],
    },
    actions: {
      type: 'array',
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'confidence', 'payload'],
            properties: {
              type: { const: 'TRANSLATE' },
              label: { const: 'Translate' },
              confidence: { type: 'number' },
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['sourceLanguage', 'detectedText', 'translatedText'],
                properties: {
                  sourceLanguage: { type: 'string' },
                  detectedText: { type: 'string' },
                  translatedText: { type: 'string' },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'confidence', 'payload'],
            properties: {
              type: { const: 'OPEN_LINK' },
              label: { const: 'Open Link' },
              confidence: { type: 'number' },
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['url', 'displayText'],
                properties: {
                  url: { type: 'string' },
                  displayText: { type: 'string' },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'confidence', 'payload'],
            properties: {
              type: { const: 'SOLVE' },
              label: { const: 'Solve' },
              confidence: { type: 'number' },
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['problemText', 'solutionSummary', 'steps', 'finalAnswer'],
                properties: {
                  problemText: { type: 'string' },
                  solutionSummary: { type: 'string' },
                  steps: { type: 'array', items: { type: 'string' } },
                  finalAnswer: { type: 'string' },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'confidence', 'payload'],
            properties: {
              type: { const: 'ADD_CONTACT' },
              label: { const: 'Add Contact' },
              confidence: { type: 'number' },
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'company', 'phone', 'email', 'website', 'address'],
                properties: {
                  name: { type: ['string', 'null'] },
                  company: { type: ['string', 'null'] },
                  phone: { type: ['string', 'null'] },
                  email: { type: ['string', 'null'] },
                  website: { type: ['string', 'null'] },
                  address: { type: ['string', 'null'] },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'confidence', 'payload'],
            properties: {
              type: { const: 'SAVE_EXPENSE' },
              label: { const: 'Save Expense' },
              confidence: { type: 'number' },
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['merchant', 'date', 'total', 'currency', 'category', 'lineItems'],
                properties: {
                  merchant: { type: ['string', 'null'] },
                  date: { type: ['string', 'null'] },
                  total: { type: ['string', 'null'] },
                  currency: { type: ['string', 'null'] },
                  category: {
                    type: ['string', 'null'],
                    enum: ['Meals', 'Travel', 'Office', 'Shopping', 'Other', null],
                  },
                  lineItems: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['name', 'amount'],
                      properties: {
                        name: { type: 'string' },
                        amount: { type: ['string', 'null'] },
                      },
                    },
                  },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'confidence', 'payload'],
            properties: {
              type: { const: 'SET_REMINDER' },
              label: { const: 'Set Reminder' },
              confidence: { type: 'number' },
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'suggestedReminderText', 'dateTimeText', 'relativeTimeMinutes', 'reason'],
                properties: {
                  title: { type: 'string' },
                  suggestedReminderText: { type: 'string' },
                  dateTimeText: { type: ['string', 'null'] },
                  relativeTimeMinutes: { type: ['integer', 'null'] },
                  reason: { type: 'string' },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'confidence', 'payload'],
            properties: {
              type: { const: 'ADD_EVENT' },
              label: { const: 'Add Event' },
              confidence: { type: 'number' },
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'date', 'startTime', 'endTime', 'location', 'description'],
                properties: {
                  title: { type: 'string' },
                  date: { type: ['string', 'null'] },
                  startTime: { type: ['string', 'null'] },
                  endTime: { type: ['string', 'null'] },
                  location: { type: ['string', 'null'] },
                  description: { type: ['string', 'null'] },
                },
              },
            },
          },
        ],
      },
    },
  },
}

const sceneTypeSchema = z.enum([
  'event',
  'receipt',
  'contact',
  'link',
  'foreign_text',
  'math',
  'parking',
  'general',
])

const actionSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal('TRANSLATE'),
        label: z.literal('Translate'),
        confidence: z.number().min(0).max(1),
        payload: z
          .object({
            sourceLanguage: z.string(),
            detectedText: z.string(),
            translatedText: z.string(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        type: z.literal('OPEN_LINK'),
        label: z.literal('Open Link'),
        confidence: z.number().min(0).max(1),
        payload: z
          .object({
            url: z.string(),
            displayText: z.string(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        type: z.literal('SOLVE'),
        label: z.literal('Solve'),
        confidence: z.number().min(0).max(1),
        payload: z
          .object({
            problemText: z.string(),
            solutionSummary: z.string(),
            steps: z.array(z.string()),
            finalAnswer: z.string(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        type: z.literal('ADD_CONTACT'),
        label: z.literal('Add Contact'),
        confidence: z.number().min(0).max(1),
        payload: z
          .object({
            name: z.string().nullable(),
            company: z.string().nullable(),
            phone: z.string().nullable(),
            email: z.string().nullable(),
            website: z.string().nullable(),
            address: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        type: z.literal('SAVE_EXPENSE'),
        label: z.literal('Save Expense'),
        confidence: z.number().min(0).max(1),
        payload: z
          .object({
            merchant: z.string().nullable(),
            date: z.string().nullable(),
            total: z.string().nullable(),
            currency: z.string().nullable(),
            category: z.enum(['Meals', 'Travel', 'Office', 'Shopping', 'Other']).nullable(),
            lineItems: z.array(
              z
                .object({
                  name: z.string(),
                  amount: z.string().nullable(),
                })
                .strict(),
            ),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        type: z.literal('SET_REMINDER'),
        label: z.literal('Set Reminder'),
        confidence: z.number().min(0).max(1),
        payload: z
          .object({
            title: z.string(),
            suggestedReminderText: z.string(),
            dateTimeText: z.string().nullable(),
            relativeTimeMinutes: z.number().int().nullable(),
            reason: z.string(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        type: z.literal('ADD_EVENT'),
        label: z.literal('Add Event'),
        confidence: z.number().min(0).max(1),
        payload: z
          .object({
            title: z.string(),
            date: z.string().nullable(),
            startTime: z.string().nullable(),
            endTime: z.string().nullable(),
            location: z.string().nullable(),
            description: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
  ])
  .superRefine((action, ctx) => {
    if (action.type === 'OPEN_LINK' && !findUrl(action.payload.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'url'],
        message: 'OPEN_LINK requires a valid URL.',
      })
    }

    if (action.type === 'ADD_CONTACT') {
      const count = [
        action.payload.name,
        action.payload.company,
        action.payload.phone,
        action.payload.email,
      ].filter(Boolean).length

      if (count < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload'],
          message: 'ADD_CONTACT requires at least two identifying fields.',
        })
      }
    }

    if (action.type === 'ADD_EVENT') {
      const hasAnchor =
        Boolean(action.payload.date) ||
        Boolean(action.payload.startTime) ||
        Boolean(action.payload.location)

      if (!action.payload.title || !hasAnchor) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload'],
          message: 'ADD_EVENT requires a title and date/time or location.',
        })
      }
    }
  })

const analysisSchema = z
  .object({
    summary: z.string(),
    primarySceneType: sceneTypeSchema,
    actions: z.array(actionSchema),
  })
  .strict()

const requestSchema = z
  .object({
    imageDataUrl: z.string().min(1),
  })
  .strict()

const askImageRequestSchema = z
  .object({
    imageDataUrl: z.string().min(1),
    question: z.string().trim().min(1).max(800),
    summary: z.string().optional(),
  })
  .strict()

const translateImageRequestSchema = z
  .object({
    imageDataUrl: z.string().min(1),
    targetLanguage: z.string().trim().min(1).max(80),
    detectedText: z.string().optional(),
    summary: z.string().optional(),
  })
  .strict()

const app = express()
let ocrWorkerPromise = null

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }

      const allowed =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
        /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/i.test(origin) ||
        /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/i.test(origin) ||
        /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$/i.test(origin)

      callback(allowed ? null : new Error('Origin not allowed by CORS'), allowed)
    },
  }),
)

app.use(express.json({ limit: '15mb' }))

app.get('/api/health', async (_req, res) => {
  const ollamaStatus = await checkOllama()
  res.json({
    ok: true,
    analyzerMode: 'ollama',
    ollamaModel,
    ollamaStatus,
  })
})

app.post('/api/analyze-image', async (req, res) => {
  const parsedRequest = requestSchema.safeParse(req.body)

  if (!parsedRequest.success) {
    res.status(400).json({
      error: 'Missing or invalid imageDataUrl.',
      details: parsedRequest.error.flatten(),
    })
    return
  }

  try {
    const analysis = await analyzeWithOllama(parsedRequest.data.imageDataUrl)
    res.json(analysisSchema.parse(analysis))
  } catch (error) {
    console.error('Image analysis failed:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not analyze image.',
    })
  }
})

app.post('/api/ask-image', async (req, res) => {
  const parsedRequest = askImageRequestSchema.safeParse(req.body)

  if (!parsedRequest.success) {
    res.status(400).json({
      error: 'Missing or invalid image question payload.',
      details: parsedRequest.error.flatten(),
    })
    return
  }

  try {
    const answer = await askImageWithOllama(parsedRequest.data)
    res.json({ answer })
  } catch (error) {
    console.error('Image question failed:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not answer question.',
    })
  }
})

app.post('/api/translate-image', async (req, res) => {
  const parsedRequest = translateImageRequestSchema.safeParse(req.body)

  if (!parsedRequest.success) {
    res.status(400).json({
      error: 'Missing or invalid image translation payload.',
      details: parsedRequest.error.flatten(),
    })
    return
  }

  try {
    const translation = await translateImageWithOllama(parsedRequest.data)
    res.json({ translation })
  } catch (error) {
    console.error('Image translation failed:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not translate image text.',
    })
  }
})

await bootstrap()

async function analyzeWithOllama(imageDataUrl) {
  const base64Image = getBase64Image(imageDataUrl)
  const hints = await getAnalysisHints(imageDataUrl)

  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      format: analysisJsonSchema,
      options: {
        temperature: 0,
      },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: buildUserPrompt(hints),
          images: [base64Image],
        },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Ollama request failed: ${response.status} ${body}`)
  }

  const data = await response.json()
  const content = data?.message?.content

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Ollama returned an empty response.')
  }

  const parsed = analysisSchema.parse(JSON.parse(content))
  return normalizeAnalysis(parsed, hints)
}

async function askImageWithOllama({ imageDataUrl, question, summary }) {
  const base64Image = getBase64Image(imageDataUrl)

  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      options: {
        temperature: 0.2,
      },
      messages: [
        {
          role: 'system',
          content:
            'You answer questions about a captured image for a Visual Intelligence-style camera app. Be concise, grounded in visible evidence, and say when the image does not contain enough information.',
        },
        {
          role: 'user',
          content: [
            summary ? `Previous scene summary: ${summary}` : null,
            `Question: ${question}`,
          ]
            .filter(Boolean)
            .join('\n'),
          images: [base64Image],
        },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Ollama request failed: ${response.status} ${body}`)
  }

  const data = await response.json()
  const content = data?.message?.content

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Ollama returned an empty answer.')
  }

  return normalizeWhitespace(content)
}

async function translateImageWithOllama({ imageDataUrl, targetLanguage, detectedText, summary }) {
  const base64Image = getBase64Image(imageDataUrl)

  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      options: {
        temperature: 0,
      },
      messages: [
        {
          role: 'system',
          content:
            'You translate visible text in a captured image. Return only the translation text, no commentary. If no readable text is visible, say "No readable text found."',
        },
        {
          role: 'user',
          content: [
            `Target language: ${targetLanguage}`,
            detectedText ? `Detected text hint: ${detectedText}` : null,
            summary ? `Previous scene summary: ${summary}` : null,
            'Translate the visible text in the image into the target language.',
          ]
            .filter(Boolean)
            .join('\n'),
          images: [base64Image],
        },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Ollama request failed: ${response.status} ${body}`)
  }

  const data = await response.json()
  const content = data?.message?.content

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Ollama returned an empty translation.')
  }

  return normalizeWhitespace(content)
}

async function bootstrap() {
  await ensureOllamaReady()

  const server = app.listen(port, () => {
    console.log(`Phase 2 server listening on http://localhost:${port} (ollama mode: ${ollamaModel})`)
  })

  server.on('close', () => {
    console.log('Phase 2 server closed.')
  })

  server.on('error', (error) => {
    console.error('Phase 2 server error:', error)
  })
}

async function ensureOllamaReady() {
  const initialStatus = await checkOllama()

  if (!initialStatus.reachable) {
    await ensureOllamaBinary()
    await launchOllamaServe()
    await waitForOllama()
  }

  const readyStatus = await checkOllama()

  if (!readyStatus.reachable) {
    throw new Error(
      `Ollama is not reachable at ${ollamaBaseUrl}. Start it with "${ollamaBin} serve" or set OLLAMA_BASE_URL.`,
    )
  }

  if (!readyStatus.modelAvailable) {
    await pullOllamaModel()
  }
}

async function ensureOllamaBinary() {
  try {
    await access(ollamaBin)
  } catch {
    throw new Error(
      `Ollama binary not found at ${ollamaBin}. Install Ollama locally or set OLLAMA_BIN to your ollama executable.`,
    )
  }
}

async function launchOllamaServe() {
  const child = spawn(ollamaBin, ['serve'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })

  child.unref()
}

async function waitForOllama() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await checkOllama()

    if (status.reachable) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Timed out waiting for Ollama at ${ollamaBaseUrl}.`)
}

async function pullOllamaModel() {
  console.log(`Pulling Ollama model ${ollamaModel}...`)

  await new Promise((resolve, reject) => {
    const child = spawn(ollamaBin, ['pull', ollamaModel], {
      stdio: 'inherit',
      env: process.env,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`ollama pull ${ollamaModel} failed with exit code ${code ?? 'unknown'}.`))
    })

    child.on('error', reject)
  })
}

function buildUserPrompt(hints) {
  return [
    'Inspect the attached captured camera image and return only JSON matching the provided schema.',
    'Supported actions: TRANSLATE, OPEN_LINK, SOLVE, ADD_CONTACT, SAVE_EXPENSE, SET_REMINDER, ADD_EVENT.',
    'Action rules:',
    '1. TRANSLATE whenever visible text appears to be non-English, even if OCR is incomplete.',
    '2. OPEN_LINK only when a QR code, URL, domain, or obvious link text exists. Never use placeholder URLs like example.com.',
    '3. SOLVE only for math problems, worksheets, homework, puzzles, code, or error screenshots.',
    '4. ADD_CONTACT only for business cards, email signatures, or flyers with personal contact information.',
    '5. SAVE_EXPENSE only for receipts, invoices, restaurant checks, or purchase confirmations.',
    '6. SET_REMINDER only for parking signs, deadlines, due dates, expiration dates, pickup windows, or other time-sensitive information.',
    '7. ADD_EVENT only for event posters, class schedules, invitations, conference posters, or meetup notices.',
    'If information is missing or unclear, prefer null fields over guessing.',
    hints.qrText ? `QR hint: ${hints.qrText}` : 'QR hint: none',
    hints.ocrText ? `OCR hint: ${truncate(hints.ocrText, 4000)}` : 'OCR hint: none',
  ].join('\n')
}

async function getAnalysisHints(imageDataUrl) {
  const buffer = decodeDataUrl(imageDataUrl)
  const image = await Jimp.read(buffer)

  let qrText = null
  let ocrText = null

  try {
    qrText = readQRCode(image)
  } catch {
    qrText = null
  }

  try {
    ocrText = await readText(buffer)
  } catch {
    ocrText = null
  }

  return {
    qrText,
    ocrText: normalizeWhitespace(ocrText || ''),
  }
}

async function checkOllama() {
  try {
    const versionResponse = await fetch(`${ollamaBaseUrl}/api/version`, {
      signal: AbortSignal.timeout(2000),
    })

    if (!versionResponse.ok) {
      return {
        reachable: false,
        modelAvailable: false,
      }
    }

    const tagsResponse = await fetch(`${ollamaBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(4000),
    })

    const tagsJson = await tagsResponse.json()
    const models = Array.isArray(tagsJson?.models) ? tagsJson.models : []

    return {
      reachable: true,
      modelAvailable: models.some((model) => model?.name === ollamaModel),
    }
  } catch {
    return {
      reachable: false,
      modelAvailable: false,
    }
  }
}

function decodeDataUrl(imageDataUrl) {
  const match = imageDataUrl.match(/^data:(.+);base64,(.+)$/)

  if (!match) {
    throw new Error('Invalid data URL')
  }

  return Buffer.from(match[2], 'base64')
}

function getBase64Image(imageDataUrl) {
  const match = imageDataUrl.match(/^data:(.+);base64,(.+)$/)

  if (!match) {
    throw new Error('Invalid data URL')
  }

  return match[2]
}

function readQRCode(image) {
  const candidates = buildQrCandidates(image)

  for (const candidate of candidates) {
    const code = jsQR(candidate.data, candidate.width, candidate.height, {
      inversionAttempts: 'attemptBoth',
    })

    if (code?.data) {
      return code.data
    }
  }

  return null
}

function buildQrCandidates(image) {
  const { data, width, height } = image.bitmap
  const crops = [
    [0, 0, width, height],
    [Math.floor(width * 0.15), Math.floor(height * 0.15), Math.floor(width * 0.7), Math.floor(height * 0.7)],
    [0, 0, Math.ceil(width / 2), Math.ceil(height / 2)],
    [Math.floor(width / 2), 0, Math.ceil(width / 2), Math.ceil(height / 2)],
    [0, Math.floor(height / 2), Math.ceil(width / 2), Math.ceil(height / 2)],
    [Math.floor(width / 2), Math.floor(height / 2), Math.ceil(width / 2), Math.ceil(height / 2)],
  ]
  const candidates = []

  for (const [x, y, cropWidth, cropHeight] of crops) {
    const cropped = cropBitmap(data, width, height, x, y, cropWidth, cropHeight)
    const scaled = scaleCandidate(cropped)

    candidates.push(cropped)
    candidates.push(scaled)

    for (const threshold of [105, 125, 145, 165, 185]) {
      candidates.push(thresholdCandidate(scaled, threshold, false))
      candidates.push(thresholdCandidate(scaled, threshold, true))
    }
  }

  return candidates
}

function cropBitmap(sourceData, sourceWidth, sourceHeight, x, y, width, height) {
  const safeX = Math.max(0, Math.min(sourceWidth - 1, x))
  const safeY = Math.max(0, Math.min(sourceHeight - 1, y))
  const safeWidth = Math.max(1, Math.min(width, sourceWidth - safeX))
  const safeHeight = Math.max(1, Math.min(height, sourceHeight - safeY))
  const target = new Uint8ClampedArray(safeWidth * safeHeight * 4)

  for (let row = 0; row < safeHeight; row += 1) {
    for (let column = 0; column < safeWidth; column += 1) {
      const sourceIndex = ((safeY + row) * sourceWidth + safeX + column) * 4
      const targetIndex = (row * safeWidth + column) * 4
      target[targetIndex] = sourceData[sourceIndex]
      target[targetIndex + 1] = sourceData[sourceIndex + 1]
      target[targetIndex + 2] = sourceData[sourceIndex + 2]
      target[targetIndex + 3] = sourceData[sourceIndex + 3]
    }
  }

  return {
    data: target,
    width: safeWidth,
    height: safeHeight,
  }
}

function scaleCandidate(candidate) {
  const longestSide = Math.max(candidate.width, candidate.height)

  if (longestSide >= 650) {
    return candidate
  }

  const scale = Math.ceil(650 / longestSide)
  const targetWidth = candidate.width * scale
  const targetHeight = candidate.height * scale
  const target = new Uint8ClampedArray(targetWidth * targetHeight * 4)

  for (let row = 0; row < targetHeight; row += 1) {
    for (let column = 0; column < targetWidth; column += 1) {
      const sourceColumn = Math.floor(column / scale)
      const sourceRow = Math.floor(row / scale)
      const sourceIndex = (sourceRow * candidate.width + sourceColumn) * 4
      const targetIndex = (row * targetWidth + column) * 4
      target[targetIndex] = candidate.data[sourceIndex]
      target[targetIndex + 1] = candidate.data[sourceIndex + 1]
      target[targetIndex + 2] = candidate.data[sourceIndex + 2]
      target[targetIndex + 3] = candidate.data[sourceIndex + 3]
    }
  }

  return {
    data: target,
    width: targetWidth,
    height: targetHeight,
  }
}

function thresholdCandidate(candidate, threshold, invert) {
  const target = new Uint8ClampedArray(candidate.data.length)

  for (let index = 0; index < candidate.data.length; index += 4) {
    const red = candidate.data[index]
    const green = candidate.data[index + 1]
    const blue = candidate.data[index + 2]
    const alpha = candidate.data[index + 3]
    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    const value = luminance > threshold ? 255 : 0
    const output = invert ? 255 - value : value

    target[index] = output
    target[index + 1] = output
    target[index + 2] = output
    target[index + 3] = alpha
  }

  return {
    data: target,
    width: candidate.width,
    height: candidate.height,
  }
}

async function readText(buffer) {
  const worker = await getOCRWorker()
  const result = await worker.recognize(buffer)
  return result.data.text || ''
}

async function getOCRWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('eng')
  }

  return ocrWorkerPromise
}

function normalizeAnalysis(analysis, hints) {
  const qrUrl = findUrl(hints.qrText)
  const ocrUrl = findUrl(hints.ocrText)
  const evidenceText = normalizeWhitespace([hints.qrText, hints.ocrText].filter(Boolean).join('\n'))
  const detectedUrl = qrUrl || ocrUrl

  const actions = filterActionsByEvidence(analysis.actions, {
    evidenceText,
    qrText: hints.qrText,
    qrUrl,
    ocrUrl,
    summary: analysis.summary,
    primarySceneType: analysis.primarySceneType,
  })

  if (detectedUrl) {
    const detectedAction = {
      type: 'OPEN_LINK',
      label: 'Open Link',
      confidence: qrUrl ? 0.98 : 0.9,
      payload: {
        url: normalizeUrl(detectedUrl),
        displayText: hints.qrText || detectedUrl,
      },
    }
    const existingIndex = actions.findIndex((action) => action.type === 'OPEN_LINK')

    if (existingIndex === -1) {
      actions.unshift(detectedAction)
    } else {
      actions[existingIndex] = detectedAction
    }
  }

  maybeAddTranslateFromSummary(actions, {
    evidenceText,
    summary: analysis.summary,
    primarySceneType: analysis.primarySceneType,
  })

  return {
    ...analysis,
    summary: analysis.summary || inferSummaryFromActions(actions),
    primarySceneType: inferPrimarySceneType(actions, analysis.primarySceneType),
    actions: actions
      .map((action) => {
        if (action.type === 'OPEN_LINK') {
          return {
            ...action,
            payload: {
              ...action.payload,
              url: normalizeUrl(action.payload.url),
            },
          }
        }

        return action
      })
      .filter((action) => action.confidence >= minimumActionConfidence)
      .sort((left, right) => right.confidence - left.confidence),
  }
}

function filterActionsByEvidence(actions, hints) {
  const text = hints.evidenceText
  const summary = normalizeWhitespace(hints.summary || '')
  const combinedText = normalizeWhitespace([text, summary].filter(Boolean).join('\n'))
  const sparseText = text.length < 12
  const phone = extractPhone(combinedText)
  const email = extractEmail(combinedText)
  const website = extractWebsite(combinedText)
  const date = extractDate(combinedText)
  const time = extractTime(combinedText)
  const money = combinedText.match(/(?:\$|USD\s?)\d+[.,]?\d{0,2}/gi) || []
  const receiptKeywords = /(receipt|subtotal|total|tax|invoice|amount due|balance due|order|merchant|visa|mastercard|change)/i
  const reminderKeywords = /(parking|expires|expiration|pickup|deadline|due|return by|valid until|max stay|minutes|hours)/i
  const eventKeywords = /(concert|meetup|conference|event|invitation|class|workshop|session|tickets|doors open|live tonight)/i
  const solveKeywords = /(solve|simplify|evaluate|equation|find x|integral|derivative|worksheet|homework|error|exception|traceback|syntaxerror|referenceerror)/i
  const translateKeywords = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f]|hola|gracias|bonjour|merci|salida|sortie|entrada|ferme|cerrado|chinese|japanese|korean|spanish|french|german|arabic|hindi/i
  const summaryDeniesText = /(no visible text|no text|there is no visible text|without visible text|no readable text)/i.test(summary)
  const summarySuggestsTranslation =
    !summaryDeniesText && (detectLanguageFromSummary(summary) !== null || suggestsForeignText(summary))

  if (!hints.qrUrl && sparseText && !summarySuggestsTranslation) {
    return []
  }

  return actions.filter((action) => {
    switch (action.type) {
      case 'OPEN_LINK':
        return hasUrlEvidence(action.payload.url, {
          evidenceText: text,
          qrUrl: hints.qrUrl,
          ocrUrl: hints.ocrUrl,
          summary,
          primarySceneType: hints.primarySceneType,
        })
      case 'SAVE_EXPENSE':
        return receiptKeywords.test(combinedText) || money.length >= 2
      case 'ADD_CONTACT':
        return [phone, email, website, action.payload.name, action.payload.company].filter(Boolean).length >= 2
      case 'SET_REMINDER':
        return reminderKeywords.test(combinedText) && Boolean(date || time || extractRelativeMinutes(combinedText))
      case 'ADD_EVENT':
        return Boolean((eventKeywords.test(combinedText) || action.payload.title) && (date || time || action.payload.location))
      case 'SOLVE':
        return solveKeywords.test(combinedText) || (/[=][^=]/.test(combinedText) && /[\dxy+\-*/^]/i.test(combinedText))
      case 'TRANSLATE':
        return !summaryDeniesText && (translateKeywords.test(combinedText) || summarySuggestsTranslation)
      default:
        return false
    }
  })
}

function maybeAddTranslateFromSummary(actions, hints) {
  if (actions.some((action) => action.type === 'TRANSLATE')) {
    return
  }

  const summary = normalizeWhitespace(hints.summary || '')
  const sourceLanguage =
    detectLanguageFromSummary(summary) ||
    (suggestsForeignText(summary) ? 'unknown' : null) ||
    (hasMeaningfulForeignEvidence(hints.evidenceText) ? 'unknown' : null)

  if (!sourceLanguage) {
    return
  }

  actions.unshift({
    type: 'TRANSLATE',
    label: 'Translate',
    confidence: sourceLanguage === 'unknown' ? 0.72 : 0.86,
    payload: {
      sourceLanguage,
      detectedText: hints.evidenceText || summary,
      translatedText:
        hints.evidenceText && hints.evidenceText !== summary
          ? `Detected ${sourceLanguage} text in the image.`
          : `Detected ${sourceLanguage} text. Open Ask for a fuller translation.`,
    },
  })
}

function detectLanguageFromSummary(summary) {
  const lower = summary.toLowerCase()

  if (lower.includes('chinese') || lower.includes('mandarin') || lower.includes('cantonese')) return 'Chinese'
  if (lower.includes('japanese')) return 'Japanese'
  if (lower.includes('korean')) return 'Korean'
  if (lower.includes('spanish')) return 'Spanish'
  if (lower.includes('french')) return 'French'
  if (lower.includes('german')) return 'German'
  if (lower.includes('arabic')) return 'Arabic'
  if (lower.includes('hindi')) return 'Hindi'
  if (lower.includes('portuguese')) return 'Portuguese'
  if (lower.includes('italian')) return 'Italian'
  if (lower.includes('russian') || lower.includes('cyrillic')) return 'Russian'
  if (lower.includes('thai')) return 'Thai'
  if (lower.includes('vietnamese')) return 'Vietnamese'

  return null
}

function suggestsForeignText(summary) {
  if (/(no visible text|no text|there is no visible text|without visible text|no readable text)/i.test(summary)) {
    return false
  }

  return /(non-english|foreign[-\s]?language|another language|untranslated|appears to be in|text in a language|characters|script|visible text is not english)/i.test(summary)
}

function hasMeaningfulForeignEvidence(text) {
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f]/.test(text || '')
}

function inferSummaryFromActions(actions) {
  if (actions.some((action) => action.type === 'SAVE_EXPENSE')) {
    return 'Receipt or expense details detected.'
  }

  if (actions.some((action) => action.type === 'ADD_EVENT')) {
    return 'Event details detected.'
  }

  if (actions.some((action) => action.type === 'ADD_CONTACT')) {
    return 'Contact details detected.'
  }

  if (actions.some((action) => action.type === 'SET_REMINDER')) {
    return 'Time-sensitive information detected.'
  }

  if (actions.some((action) => action.type === 'OPEN_LINK')) {
    return 'A link or QR code was detected.'
  }

  if (actions.some((action) => action.type === 'TRANSLATE')) {
    return 'Foreign-language text detected.'
  }

  if (actions.some((action) => action.type === 'SOLVE')) {
    return 'A solvable problem was detected.'
  }

  return 'No strong contextual action was detected.'
}

function inferPrimarySceneType(actions, fallback) {
  const priority = [
    ['ADD_EVENT', 'event'],
    ['SAVE_EXPENSE', 'receipt'],
    ['ADD_CONTACT', 'contact'],
    ['OPEN_LINK', 'link'],
    ['TRANSLATE', 'foreign_text'],
    ['SOLVE', 'math'],
    ['SET_REMINDER', 'parking'],
  ]

  for (const [type, scene] of priority) {
    if (actions.some((action) => action.type === type)) {
      return scene
    }
  }

  return fallback || 'general'
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function truncate(text, maxLength) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

function findUrl(text) {
  if (!text) {
    return null
  }

  const httpMatch = text.match(/https?:\/\/[^\s)]+/i)
  if (httpMatch) {
    return httpMatch[0]
  }

  const domainMatch = text.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?\b/i)
  return domainMatch?.[0] || null
}

function normalizeUrl(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function hasUrlEvidence(url, { evidenceText, qrUrl, ocrUrl, summary, primarySceneType }) {
  if (isPlaceholderUrl(url)) {
    return false
  }

  if (qrUrl || ocrUrl) {
    return true
  }

  const detectedUrl = findUrl(url)

  if (!detectedUrl) {
    return false
  }

  const normalizedNeedle = stripUrlForComparison(normalizeUrl(detectedUrl))
  const normalizedEvidence = stripUrlForComparison(evidenceText)
  if (normalizedNeedle && normalizedEvidence.includes(normalizedNeedle)) {
    return true
  }

  return (
    primarySceneType === 'link' ||
    /\b(qr|qr code|url|link|website|domain)\b/i.test(summary || '')
  )
}

function stripUrlForComparison(value) {
  return normalizeWhitespace(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[)\].,;!?]+$/g, '')
}

function isPlaceholderUrl(url) {
  const normalized = stripUrlForComparison(normalizeUrl(url || ''))
  return /^(example\.com|example\.org|example\.net|localhost|127\.0\.0\.1)(?:\/|$)/i.test(normalized)
}

function extractDate(text) {
  const patterns = [
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?\b/i,
    /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+\d{4})?\b/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return match[0]
    }
  }

  return null
}

function extractTime(text) {
  const match =
    text.match(/\b\d{1,2}(?::\d{2})?\s?(?:AM|PM)\b/i) || text.match(/\b\d{1,2}:\d{2}\b/)
  return match?.[0] || null
}

function extractRelativeMinutes(text) {
  const hourMatch = text.match(/\b(\d+)\s*(?:hour|hr)s?\b/i)
  if (hourMatch) {
    return Number(hourMatch[1]) * 60
  }

  const minuteMatch = text.match(/\b(\d+)\s*(?:minute|min)s?\b/i)
  if (minuteMatch) {
    return Number(minuteMatch[1])
  }

  return null
}

function extractEmail(text) {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match?.[0] || null
}

function extractPhone(text) {
  const match = text.match(/(?:\+?\d{1,2}\s*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/)
  return match?.[0] || null
}

function extractWebsite(text) {
  const match = text.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i)
  return match?.[0] || null
}
