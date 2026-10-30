import { useEffect, useRef, useState } from 'react'
import { motion as M, AnimatePresence } from 'framer-motion'
import './index.css'
import './App.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

const PROMPT_TARGETS = [
  { value: 'SDXL',        label: 'SDXL',        desc: 'Detailed, natural-language prompts' },
  { value: 'Flux',        label: 'Flux',         desc: 'Detailed prompts with strong instruction following' },
  { value: 'Midjourney',  label: 'Midjourney',   desc: 'Natural language and style-oriented prompts' },
  { value: 'SD 1.5',      label: 'SD 1.5',       desc: 'Classic Stable Diffusion prompt style' },
  { value: 'SD 3',        label: 'SD 3',         desc: 'Natural-language prompt style' },
  { value: 'Nano Banana', label: 'Nano Banana',  desc: 'Prompt style targeting Nano Banana' },
]

const GENERATION_MODELS = [
  { value: 'sdxl-lightning',    label: 'SDXL Lightning' },
  { value: 'flux',              label: 'FLUX.1 Schnell' },
  { value: 'flux-2-klein-4b',   label: 'FLUX.2 Klein 4B' },
  { value: 'nano-banana',       label: 'Nano Banana' },
]

// Text-enhancement provider options (Moondream excluded — vision-only).
const ENHANCE_MODELS = [
  { value: 'groq-qwen',        provider: 'Groq',                  label: 'Qwen 3.8 27B' },
  { value: 'gemini',           provider: 'Google Gemini',         label: 'Gemini Flash' },
  { value: 'cf-llama-4-scout', provider: 'Cloudflare',            label: 'Llama 4 Scout 17B' },
  { value: 'cf-mistral-small', provider: 'Cloudflare',            label: 'Mistral Small 3.1 24B' },
]

// Image-analysis provider options shown in the model selector.
// Order: default (Groq Qwen) first, then Gemini, then Cloudflare models.
const ANALYSIS_MODELS = [
  { value: 'groq-qwen',        provider: 'Groq',                  label: 'Qwen 3.8 27B' },
  { value: 'gemini',           provider: 'Google Gemini',         label: 'Gemini Flash' },
  { value: 'cf-llama-4-scout', provider: 'Cloudflare',            label: 'Llama 4 Scout 17B' },
  { value: 'cf-mistral-small', provider: 'Cloudflare',            label: 'Mistral Small 3.1 24B' },
  { value: 'cf-moondream',     provider: 'Cloudflare',            label: 'Moondream 3.1' },
]

const EXAMPLE_PROMPTS = [
  'A samurai at dusk, cherry blossoms',
  'Abandoned library, golden hour',
  'Foggy mountain temple at dawn',
  'Deep sea creature, bioluminescent',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()
  if (!response.ok) {
    const detail = typeof body === 'object' ? body?.detail : body
    throw new Error(detail || `Request failed (${response.status})`)
  }
  return body
}

// Respect prefers-reduced-motion at module level
const REDUCED = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const FADE_UP = REDUCED ? {} : {
  initial:    { opacity: 0, y: 18 },
  animate:    { opacity: 1, y: 0  },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
}

const STAGGER = REDUCED ? {} : {
  variants: {
    hidden: {},
    show:   { transition: { staggerChildren: 0.08 } },
  },
  initial: 'hidden',
  animate: 'show',
}

const STAGGER_ITEM = REDUCED ? {} : {
  variants: {
    hidden: { opacity: 0, y: 12 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' } },
  },
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function TopBar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-white/5 bg-forge-bg/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-5 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold text-forge-ink tracking-wide leading-none select-none">
            PromptForge
          </span>
          <span
            className="text-[11px] text-forge-muted/55 font-sans leading-none"
            aria-label="Tanzo — forged"
            title="鍛造 — forged"
          >
            鍛造
          </span>
        </div>
        {/* Nav */}
        <nav className="flex items-center gap-5" aria-label="Site navigation">
          <a
            href="#forge"
            className="text-xs font-sans text-forge-muted hover:text-forge-ink transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-forge-amber focus-visible:rounded-sm"
          >
            Forge
          </a>
          <a
            href="#analyze"
            className="text-xs font-sans text-forge-muted hover:text-forge-ink transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-forge-amber focus-visible:rounded-sm"
          >
            Analyze
          </a>
        </nav>
      </div>
    </header>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 15 }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-block shrink-0 rounded-full border-2 border-white/20 border-t-white animate-spin"
      aria-hidden="true"
    />
  )
}

// ─── SegmentedControl (replaces native <select> for prompt target) ─────────────

function SegmentedControl({ options, value, onChange, ariaLabel }) {
  const selected = options.find(o => o.value === value)
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={ariaLabel || 'Select option'}
        className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-forge-bg/60 border border-white/10"
      >
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={[
              'px-3 py-1.5 rounded-lg text-[11px] font-medium font-sans transition-all duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forge-amber',
              value === opt.value
                ? 'bg-forge-amber/15 text-forge-amber border border-forge-amber/35'
                : 'text-forge-muted hover:text-forge-ink border border-transparent hover:bg-white/5',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {selected && (
          <M.p
            key={selected.value}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="mt-2 text-[11px] font-sans text-forge-muted/70 text-left"
          >
            {selected.desc}
          </M.p>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── ExampleChips ─────────────────────────────────────────────────────────────

function ExampleChips({ onSelect }) {
  return (
    <div
      className="flex flex-wrap gap-1.5 mt-3"
      role="group"
      aria-label="Example prompts"
    >
      {EXAMPLE_PROMPTS.map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className="px-2.5 py-1 text-[11px] font-sans rounded-full border border-white/10 text-forge-muted hover:text-forge-ink hover:border-white/20 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-forge-amber"
        >
          {p}
        </button>
      ))}
    </div>
  )
}

// ─── AdvancedAccordion ────────────────────────────────────────────────────────

function AdvancedAccordion({
  seed, setSeed,
  steps, setSteps,
  guidance, setGuidance,
  imgSize, setImgSize,
  open, onToggle,
}) {
  const inputBase =
    'bg-forge-bg border border-white/10 text-forge-ink font-mono text-xs rounded-lg px-3 py-2 ' +
    'focus:outline-none focus:border-forge-amber/40 focus:ring-1 focus:ring-forge-amber/15 transition-colors w-full'

  const fields = [
    { label: 'Seed',     value: seed,     setter: setSeed,     type: 'number', min: 0,   step: 1   },
    { label: 'Steps',    value: steps,    setter: setSteps,    type: 'number', min: 1,   max: 20, step: 1 },
    { label: 'Guidance', value: guidance, setter: setGuidance, type: 'number', min: 1.0, max: 20, step: 0.5 },
  ]

  return (
    <div className="mt-3 border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-medium font-sans text-forge-muted hover:text-forge-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-forge-amber/40"
      >
        <span>Advanced settings</span>
        <M.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-forge-muted/70 text-xs leading-none"
        >
          ▾
        </M.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <M.div
            key="adv-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pt-1 pb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {fields.map(({ label, value, setter, ...rest }) => (
                <label key={label} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium font-sans text-forge-muted">{label}</span>
                  <input
                    {...rest}
                    value={value}
                    onChange={e => setter(e.target.value)}
                    className={inputBase}
                    aria-label={label}
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium font-sans text-forge-muted">Size</span>
                <select
                  value={imgSize}
                  onChange={e => setImgSize(e.target.value)}
                  className="bg-forge-bg border border-white/10 text-forge-ink text-xs font-sans rounded-lg px-3 py-2 focus:outline-none focus:border-forge-amber/40 transition-colors w-full"
                  aria-label="Image dimensions"
                >
                  <option value="512x512">512 × 512</option>
                  <option value="768x768">768 × 768</option>
                  <option value="1024x1024">1024 × 1024</option>
                  <option value="1024x576">1024 × 576 (16:9)</option>
                </select>
              </label>
            </div>
          </M.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── NegativePromptToggle ─────────────────────────────────────────────────────

function NegativePromptToggle({ text, onCopy }) {
  const [open, setOpen] = useState(false)
  if (!text) return null

  return (
    <div className="mt-3 border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-forge-amber/40"
      >
        <span className="text-[10px] font-medium font-sans text-forge-muted uppercase tracking-widest">
          Negative prompt
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-sans text-forge-muted/50">{open ? 'collapse' : 'expand'}</span>
          <M.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-forge-muted/70 text-xs leading-none"
          >
            ▾
          </M.span>
        </div>
      </button>

        <AnimatePresence initial={false}>
          {open && (
            <M.div
              key="neg-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <p className="font-mono text-[11px] text-forge-ink/65 leading-relaxed whitespace-pre-wrap break-words">
                {text}
              </p>
              <button
                type="button"
                onClick={() => onCopy(text, 'Negative prompt copied')}
                className="mt-3 text-[11px] font-sans text-forge-cyan border border-forge-cyan/25 rounded-lg px-3 py-1.5 hover:bg-forge-cyan/10 transition-colors focus-visible:outline-2 focus-visible:outline-forge-amber"
              >
                Copy
              </button>
            </div>
          </M.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── SkeletonImage ────────────────────────────────────────────────────────────

function SkeletonImage() {
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden bg-forge-surface" aria-busy="true" aria-label="Loading image">
      <div className="aspect-square w-full skeleton-shimmer" />
      <div className="p-4 space-y-2.5">
        <div className="h-2.5 w-3/4 rounded-full skeleton-shimmer" />
        <div className="h-2.5 w-1/2 rounded-full skeleton-shimmer" />
        <div className="h-7 w-28 rounded-lg skeleton-shimmer mt-3" />
      </div>
    </div>
  )
}

// ─── BeforeAfterSlider ────────────────────────────────────────────────────────

function BeforeAfterSlider({ imageA, imageB, altA = 'Original', altB = 'Enhanced' }) {
  const [pos, setPos] = useState(50)
  const containerRef = useRef(null)
  const dragging = useRef(false)

  const clamp = v => Math.min(100, Math.max(0, v))

  const updateFromX = clientX => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPos(clamp(((clientX - rect.left) / rect.width) * 100))
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-square overflow-hidden rounded-xl cursor-col-resize select-none"
      role="img"
      aria-label={`Before/after slider — drag to compare ${altA} and ${altB}`}
      onMouseDown={() => { dragging.current = true }}
      onMouseUp={()   => { dragging.current = false }}
      onMouseLeave={() => { dragging.current = false }}
      onMouseMove={e  => { if (dragging.current) updateFromX(e.clientX) }}
      onTouchStart={() => { dragging.current = true }}
      onTouchEnd={() => { dragging.current = false }}
      onTouchMove={e  => { e.preventDefault(); updateFromX(e.touches[0].clientX) }}
    >
      {/* Enhanced — full width underneath */}
      <img
        src={imageB}
        alt={altB}
        className="absolute inset-0 w-full h-full object-contain bg-forge-bg"
      />

      {/* Original — clipped to left portion */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${clamp(100 - pos)}% 0 0)` }}
      >
        <img
          src={imageA}
          alt={altA}
          className="absolute inset-0 w-full h-full object-contain bg-forge-bg"
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute inset-y-0 w-px bg-white/70"
        style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-forge-bg font-bold text-xs">
          ⇔
        </div>
      </div>

      {/* Labels */}
      <span className="absolute bottom-3 left-3 text-[10px] font-sans font-medium text-forge-ink bg-forge-bg/75 backdrop-blur-sm px-2 py-0.5 rounded-md pointer-events-none">
        {altA}
      </span>
      <span className="absolute bottom-3 right-3 text-[10px] font-sans font-medium text-forge-ink bg-forge-bg/75 backdrop-blur-sm px-2 py-0.5 rounded-md pointer-events-none">
        {altB}
      </span>
    </div>
  )
}

// ─── ImageFrame ───────────────────────────────────────────────────────────────

function ImageFrame({ title, label, image, prompt }) {
  if (!image) return null
  return (
    <article className="rounded-xl border border-white/10 overflow-hidden bg-forge-surface/70">
      <div className="relative">
        <span className="absolute top-3 left-3 z-10 text-[10px] font-sans font-medium text-forge-ink/90 bg-forge-bg/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-white/10 pointer-events-none">
          {label}
        </span>
        <img
          src={image}
          alt={`${title} generated result`}
          className="w-full aspect-square object-contain bg-forge-bg block"
        />
      </div>
      <div className="p-4">
        <p className="text-[11px] font-mono text-forge-muted leading-relaxed line-clamp-3 break-words">
          {prompt}
        </p>
        <a
          href={image}
          download={`${title.toLowerCase().replaceAll(' ', '-')}.png`}
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-sans text-forge-cyan border border-forge-cyan/25 rounded-lg px-3 py-1.5 hover:bg-forge-cyan/10 transition-colors focus-visible:outline-2 focus-visible:outline-forge-amber"
          aria-label={`Download ${title}`}
        >
          ↓ Download
        </a>
      </div>
    </article>
  )
}

// ─── ErrorBox ─────────────────────────────────────────────────────────────────

function ErrorBox({ message }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="p-3.5 bg-red-500/8 border border-red-500/20 rounded-xl text-red-400/90 text-xs font-sans leading-relaxed whitespace-pre-wrap break-words"
    >
      {message}
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message }) {
  return (
    <M.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 bg-forge-surface border border-forge-cyan/25 text-forge-cyan text-[11px] font-sans font-medium rounded-xl shadow-lg backdrop-blur-sm whitespace-nowrap"
    >
      {message}
    </M.div>
  )
}

// ─── Shared button variants ───────────────────────────────────────────────────

const btnPrimary =
  'flex items-center justify-center gap-2.5 h-11 w-full ' +
  'bg-forge-amber text-forge-bg font-sans font-semibold text-sm rounded-xl ' +
  'hover:bg-forge-amber-lt active:scale-[0.99] transition-all ' +
  'disabled:opacity-35 disabled:cursor-not-allowed ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forge-amber'

const btnGhost =
  'text-[11px] font-sans text-forge-muted hover:text-forge-cyan ' +
  'border border-white/10 rounded-lg px-2.5 py-1 ' +
  'hover:border-forge-cyan/25 transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-forge-amber'

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {

  // ── Prompt-enhancement state (unchanged from original) ──────────────────────
  const [prompt, setPrompt]             = useState('')
  const [targetModel, setTargetModel]   = useState('SDXL')
  const [enhancement, setEnhancement]   = useState(null)
  const [enhanceLoading, setEnhanceLoading] = useState(false)
  const [enhanceError, setEnhanceError] = useState('')

  // ── Enhancement provider — persisted to localStorage ─────────────────────
  const [enhanceProvider, setEnhanceProvider] = useState(
    () => localStorage.getItem('pf_enhance_provider') || 'groq-qwen',
  )

  // ── Comparison state (unchanged from original) ───────────────────────────
  const [comparison, setComparison]         = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError]     = useState('')
  const [generationModel, setGenerationModel] = useState('sdxl-lightning')
  const [copied, setCopied]                 = useState('')

  // ── Image-analysis state (unchanged from original) ───────────────────────
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl]     = useState('')
  const [imageModel, setImageModel]     = useState('SDXL')
  const [imageResult, setImageResult]   = useState(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError]     = useState('')

  // ── Analysis provider — persisted to localStorage ────────────────────────
  const [analysisProvider, setAnalysisProvider] = useState(
    () => localStorage.getItem('pf_analysis_provider') || 'groq-qwen',
  )

  // ── New state for redesigned UI ──────────────────────────────────────────
  const [seed, setSeed]           = useState(42)
  const [steps, setSteps]         = useState(4)
  const [guidance, setGuidance]   = useState(7.5)
  const [imgSize, setImgSize]     = useState('1024x1024')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sliderMode, setSliderMode]     = useState(false)

  // ── Video background ref ─────────────────────────────────────────────────
  const artRef = useRef(null)

  // ── Effects ─────────────────────────────────────────────────────────────
  // Play / pause the background video based on prefers-reduced-motion
  useEffect(() => {
    const video = artRef.current
    if (!video) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncMotion = () => {
      const play = !query.matches
      if (play) video.play().catch(() => {})
      else video.pause()
    }
    syncMotion()
    query.addEventListener('change', syncMotion)
    return () => query.removeEventListener('change', syncMotion)
  }, [])

  useEffect(
    () => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) },
    [previewUrl],
  )

  // Persist enhancement provider selection across page loads.
  useEffect(() => {
    localStorage.setItem('pf_enhance_provider', enhanceProvider)
  }, [enhanceProvider])

  // Persist analysis provider selection across page loads.
  useEffect(() => {
    localStorage.setItem('pf_analysis_provider', analysisProvider)
  }, [analysisProvider])

  // ── Handlers (logic unchanged; comparison now reads new state) ───────────

  const copyText = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(message)
      window.setTimeout(() => setCopied(''), 1800)
    } catch {
      setCopied('Clipboard access unavailable')
      window.setTimeout(() => setCopied(''), 2200)
    }
  }

  const handleEnhance = async () => {
    if (!prompt.trim()) return
    setEnhanceLoading(true)
    setEnhanceError('')
    setEnhancement(null)
    setComparison(null)
    setCompareError('')
    try {
      const response = await fetch(`${API_URL}/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: targetModel,
          enhance_provider: enhanceProvider,
        }),
      })
      const data = await readApiResponse(response)
      setEnhancement(data)
    } catch (error) {
      const msg = error.message || ''
      const isBusy = /high demand|temporarily unavailable|503|UNAVAILABLE|RESOURCE_EXHAUSTED|429|rate limit/i.test(msg)
      setEnhanceError(
        isBusy
          ? 'The selected model is experiencing high demand. Please wait 30 seconds, then try again or choose a different model.'
          : (msg || 'Could not enhance the prompt.'),
      )
    } finally {
      setEnhanceLoading(false)
    }
  }

  const handleCompare = async () => {
    if (!enhancement?.positive_prompt) {
      setCompareError('Enhance the prompt first.')
      return
    }
    setCompareLoading(true)
    setCompareError('')
    setComparison(null)
    setSliderMode(false)

    const [width, height] = imgSize.split('x').map(Number)

    try {
      const response = await fetch(`${API_URL}/compare-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_prompt:  prompt.trim(),
          enhanced_prompt:  enhancement.positive_prompt,
          model:            generationModel,
          width,
          height,
          seed:             Number(seed),
          negative_prompt:  enhancement.negative_prompt || '',
          num_steps:        Number(steps),
          guidance:         Number(guidance),
        }),
      })
      const data = await readApiResponse(response)
      if (!data?.original?.image_data || !data?.enhanced?.image_data) {
        throw new Error('The API response did not include both generated images.')
      }
      setComparison(data)
    } catch (error) {
      setCompareError(error.message || 'Could not generate the comparison images.')
    } finally {
      setCompareLoading(false)
    }
  }

  const handleFileChange = event => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setImageError('Choose a valid image file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageError('Image must be smaller than 10 MB.')
      return
    }
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setImageResult(null)
    setImageError('')
  }

  const handleImageAnalyze = async () => {
    if (!selectedFile) {
      setImageError('Choose an image first.')
      return
    }
    setImageLoading(true)
    setImageError('')
    setImageResult(null)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('model', imageModel)
      formData.append('analysis_provider', analysisProvider)
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await readApiResponse(response)
      setImageResult(data)
    } catch (error) {
      const msg = error.message || ''
      const isRateLimit = /429|rate limit|too many/i.test(msg)
      setImageError(
        isRateLimit
          ? 'Rate limit reached for the selected model. Wait a moment, then try again or choose a different model.'
          : (msg || 'Could not analyze the image.'),
      )
    } finally {
      setImageLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="neural-app min-h-screen font-sans text-forge-ink">

      {/* Background video — styled by .neural-background / .neural-art / .neural-veil in App.css */}
      <div aria-hidden="true" className="neural-background">
        <video
          ref={artRef}
          className="neural-art"
          src="/assets/bg.mp4"
          poster="/assets/bg.jpg"
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className="neural-veil" />
      </div>

      {/* Top bar */}
      <TopBar />

      <main>

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="pt-32 pb-10 px-4 text-center" aria-labelledby="hero-title">
          <M.div {...FADE_UP} className="max-w-2xl mx-auto">
            <p className="text-[11px] font-sans font-medium text-forge-cyan uppercase tracking-[0.22em] mb-5">
              Text-to-image prompt optimizer
            </p>
            <h1
              id="hero-title"
              className="font-display font-semibold text-forge-ink leading-[1.05] tracking-tight"
              style={{ fontSize: 'clamp(2.8rem, 8vw, 4.5rem)' }}
            >
              Turn ideas into<br />
              <span className="text-forge-amber">better prompts</span>
            </h1>
            <p className="mt-5 text-sm font-sans text-forge-muted leading-relaxed max-w-xs mx-auto">
              Enter a rough idea. Gemini refines it. Compare what each
              prompt actually produces.
            </p>
          </M.div>
        </section>

        {/* ── Input panel ───────────────────────────────────────────────── */}
        <section
          id="forge"
          className="px-4 pb-10 max-w-2xl mx-auto w-full"
          aria-label="Prompt input"
        >
          <M.div
            {...FADE_UP}
            transition={{ ...(FADE_UP.transition ?? {}), delay: REDUCED ? 0 : 0.1 }}
            className="bg-forge-panel/65 border border-white/10 rounded-2xl p-5 sm:p-6 backdrop-blur-sm"
          >
            {/* Textarea */}
            <div>
              <label
                htmlFor="prompt-input"
                className="block text-[10px] font-sans font-medium text-forge-muted uppercase tracking-widest mb-2"
              >
                Your starting prompt
              </label>
              <div className="relative">
              <textarea
                  id="prompt-input"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. A futuristic city at night with neon lights and flying cars"
                  rows={4}
                  className="w-full bg-forge-bg/55 border border-white/10 text-forge-ink font-mono text-sm rounded-xl px-4 pt-3.5 pb-8 resize-none leading-relaxed focus:outline-none focus:border-forge-amber/45 focus:ring-1 focus:ring-forge-amber/15 transition-colors placeholder:text-forge-muted/40"
                />
                <span
                  className={[
                    'absolute bottom-3 right-3 text-[10px] font-mono pointer-events-none tabular-nums',
                    prompt.length > 450 ? 'text-red-400' : 'text-forge-muted/50',
                  ].join(' ')}
                  aria-live="polite"
                  aria-label={`${prompt.length} of 500 characters used`}
                >
                  {prompt.length}/500
                </span>
              </div>
              <ExampleChips onSelect={setPrompt} />
            </div>

            {/* Prompt target */}
            <div className="mt-5">
              <p className="text-[10px] font-sans font-medium text-forge-muted uppercase tracking-widest mb-2.5">
                Prompt target
              </p>
              <SegmentedControl
                options={PROMPT_TARGETS}
                value={targetModel}
                onChange={setTargetModel}
                ariaLabel="Prompt target model"
              />
            </div>

            {/* Advanced accordion */}
            <AdvancedAccordion
              seed={seed}           setSeed={setSeed}
              steps={steps}         setSteps={setSteps}
              guidance={guidance}   setGuidance={setGuidance}
              imgSize={imgSize}     setImgSize={setImgSize}
              open={showAdvanced}
              onToggle={() => setShowAdvanced(o => !o)}
            />

            {/* Enhancement model selector */}
            <div className="mt-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-sans font-medium text-forge-muted uppercase tracking-widest">
                  Enhancement model
                </span>
                <select
                  value={enhanceProvider}
                  onChange={e => {
                    setEnhanceProvider(e.target.value)
                    setEnhancement(null)
                    setEnhanceError('')
                  }}
                  className="bg-forge-bg border border-white/10 text-forge-ink text-xs font-sans rounded-lg px-3 py-2 focus:outline-none focus:border-forge-amber/40 transition-colors"
                  aria-label="Enhancement model"
                >
                  {ENHANCE_MODELS.map(m => (
                    <option key={m.value} value={m.value}>
                      {m.provider} — {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Enhance button */}
            <button
              type="button"
              onClick={handleEnhance}
              disabled={!prompt.trim() || enhanceLoading}
              className={btnPrimary + ' mt-5'}
              aria-label={enhanceLoading ? 'Enhancing prompt, please wait' : 'Enhance prompt'}
            >
              {enhanceLoading
                ? <><Spinner size={14} /><span>Enhancing…</span></>
                : 'Enhance prompt'
              }
            </button>

            {enhanceError && (
              <div className="mt-3"><ErrorBox message={enhanceError} /></div>
            )}
          </M.div>
        </section>

        {/* ── Enhancement results ───────────────────────────────────────── */}
        <AnimatePresence>
          {enhancement && !enhanceLoading && (
            <M.section
              key="results"
              {...FADE_UP}
              className="px-4 pb-8 max-w-4xl mx-auto w-full"
              aria-label="Enhancement results"
            >
              <p className="text-[10px] font-sans font-medium text-forge-cyan uppercase tracking-[0.22em] mb-4">
                Results
              </p>

              {/* Original / Enhanced side-by-side */}
              <M.div
                {...STAGGER}
                className="grid sm:grid-cols-2 gap-3"
              >
                {/* Original */}
                <M.div
                  {...STAGGER_ITEM}
                  className="bg-forge-panel/60 border border-white/10 rounded-2xl p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-sans font-medium text-forge-muted uppercase tracking-widest">
                      Original
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText(prompt, 'Original copied')}
                      className={btnGhost}
                    >
                      Copy
                    </button>
                  </div>
                  <p className="font-mono text-[11px] text-forge-ink/55 leading-relaxed whitespace-pre-wrap break-words">
                    {prompt}
                  </p>
                </M.div>

                {/* Enhanced */}
                <M.div
                  {...STAGGER_ITEM}
                  className="bg-forge-panel/60 border border-forge-amber/20 rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-sans font-medium text-forge-amber uppercase tracking-widest">
                        Enhanced
                      </span>
                      {enhancement.enhance_provider_name && (
                        <span className="text-[10px] font-sans text-forge-cyan border border-forge-cyan/25 rounded-full px-2.5 py-0.5 self-start leading-none">
                          {enhancement.enhance_provider_name} · {enhancement.enhance_model_name}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(enhancement.positive_prompt, 'Enhanced copied')}
                      className={btnGhost}
                    >
                      Copy
                    </button>
                  </div>
                  <p className="font-mono text-[11px] text-forge-ink leading-relaxed whitespace-pre-wrap break-words">
                    {enhancement.positive_prompt}
                  </p>
                </M.div>
              </M.div>

              {/* Copy both */}
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      `POSITIVE:\n${enhancement.positive_prompt}\n\nNEGATIVE:\n${enhancement.negative_prompt}`,
                      'Both prompts copied',
                    )
                  }
                  className={btnGhost}
                >
                  Copy both
                </button>
              </div>

              {/* Collapsible negative prompt */}
              <NegativePromptToggle
                text={enhancement.negative_prompt}
                onCopy={copyText}
              />

              {/* ── Generate panel ── */}
              <div className="mt-5 bg-forge-panel/60 border border-white/10 rounded-2xl p-5">
                <p className="text-[10px] font-sans font-medium text-forge-muted uppercase tracking-widest mb-1">
                  Image comparison
                </p>
                <p className="text-[11px] font-sans text-forge-muted/60 mb-4 leading-relaxed">
                  Both images use the same model and seed. Dimensions stay at the chosen size where the model supports them.
                </p>

                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-sans text-forge-muted">Image model</span>
                    <select
                      value={generationModel}
                      onChange={e => {
                        setGenerationModel(e.target.value)
                        setComparison(null)
                        setCompareError('')
                      }}
                      className="bg-forge-bg border border-white/10 text-forge-ink text-xs font-sans rounded-lg px-3 py-2 focus:outline-none focus:border-forge-amber/40 transition-colors min-w-[160px]"
                      aria-label="Image generation model"
                    >
                      {GENERATION_MODELS.map(item => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={handleCompare}
                    disabled={compareLoading || seed === ''}
                    className="flex items-center justify-center gap-2.5 h-[38px] px-5 bg-forge-amber/12 text-forge-amber border border-forge-amber/30 font-sans font-semibold text-xs rounded-xl hover:bg-forge-amber/22 active:scale-[0.99] transition-all disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forge-amber"
                    aria-label={compareLoading ? 'Generating comparison, please wait' : 'Generate comparison images'}
                  >
                    {compareLoading
                      ? <><Spinner size={13} />Generating…</>
                      : 'Generate comparison'
                    }
                  </button>
                </div>

                {compareError && (
                  <div className="mt-3"><ErrorBox message={compareError} /></div>
                )}
              </div>
            </M.section>
          )}
        </AnimatePresence>

        {/* ── Image comparison ──────────────────────────────────────────── */}
        {(compareLoading || comparison) && (
          <M.section
            {...FADE_UP}
            className="px-4 pb-12 max-w-4xl mx-auto w-full"
            aria-label="Image comparison"
          >
            {/* Heading row */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div>
                <p className="text-[10px] font-sans font-medium text-forge-cyan uppercase tracking-[0.22em] mb-1.5">
                  Side by side
                </p>
                <h2
                  className="font-display font-semibold text-forge-ink leading-tight"
                  style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)' }}
                >
                  Which prompt works better?
                </h2>
              </div>

              {comparison && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] font-sans text-forge-cyan border border-forge-cyan/25 rounded-full px-3 py-1">
                    {GENERATION_MODELS.find(m => m.value === comparison.model)?.label ?? comparison.model}
                  </span>
                  {/* Grid ↔ Slider toggle */}
                  <button
                    type="button"
                    onClick={() => setSliderMode(m => !m)}
                    aria-pressed={sliderMode}
                    className={[
                      'text-[11px] font-sans border rounded-full px-3 py-1 transition-all duration-150',
                      'focus-visible:outline-2 focus-visible:outline-forge-amber',
                      sliderMode
                        ? 'text-forge-amber border-forge-amber/35 bg-forge-amber/10'
                        : 'text-forge-muted border-white/10 hover:text-forge-ink hover:border-white/20',
                    ].join(' ')}
                    aria-label={sliderMode ? 'Switch to grid view' : 'Switch to before/after slider'}
                  >
                    {sliderMode ? 'Grid' : 'Slider'}
                  </button>
                </div>
              )}
            </div>

            {/* Content */}
            {compareLoading ? (
              <div className="grid sm:grid-cols-2 gap-4" aria-live="polite">
                <SkeletonImage />
                <SkeletonImage />
              </div>
            ) : comparison ? (
              sliderMode ? (
                <BeforeAfterSlider
                  imageA={comparison.original?.image_data}
                  imageB={comparison.enhanced?.image_data}
                  altA="Original"
                  altB="Enhanced"
                />
              ) : (
                <M.div {...STAGGER} className="grid sm:grid-cols-2 gap-4">
                  <M.div {...STAGGER_ITEM}>
                    <ImageFrame
                      title="Image A · Original"
                      label="A · Original"
                      image={comparison.original?.image_data}
                      prompt={comparison.original?.prompt || prompt}
                    />
                  </M.div>
                  <M.div {...STAGGER_ITEM}>
                    <ImageFrame
                      title="Image B · Enhanced"
                      label="B · Enhanced"
                      image={comparison.enhanced?.image_data}
                      prompt={comparison.enhanced?.prompt || enhancement?.positive_prompt}
                    />
                  </M.div>
                </M.div>
              )
            ) : null}

            {comparison && (
              <p className="mt-3.5 text-[11px] font-sans text-forge-muted/50">
                Same model and requested settings. Seed support depends on the selected model.
              </p>
            )}
          </M.section>
        )}

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="border-t border-white/5" />
        </div>

        {/* ── Image analysis ────────────────────────────────────────────── */}
        <section
          id="analyze"
          className="px-4 pb-28 max-w-2xl mx-auto w-full"
          aria-label="Image analysis"
        >
          <div className="mb-7">
            <p className="text-[10px] font-sans font-medium text-forge-cyan uppercase tracking-[0.22em] mb-2">
              Image analysis
            </p>
            <h2
              className="font-display font-semibold text-forge-ink leading-tight"
              style={{ fontSize: 'clamp(2rem, 6vw, 2.8rem)' }}
            >
              Reverse-engineer an image
            </h2>
            <p className="mt-2.5 text-sm font-sans text-forge-muted leading-relaxed max-w-xs">
              Upload a reference and get a prompt tailored to your target model.
            </p>
          </div>

          <div className="bg-forge-panel/65 border border-white/10 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
            {/* Drop zone */}
            <label className="relative flex flex-col items-center justify-center gap-3 border border-dashed border-white/12 rounded-xl p-8 cursor-pointer hover:border-forge-amber/35 hover:bg-forge-amber/[3%] transition-all duration-200 group focus-within:border-forge-amber/50">
              <span className="text-2xl text-forge-muted/40 group-hover:text-forge-amber/50 transition-colors leading-none select-none">
                ↑
              </span>
              <span className="text-xs font-sans text-forge-muted group-hover:text-forge-ink transition-colors text-center">
                {selectedFile ? selectedFile.name : 'Choose an image · max 10 MB'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="sr-only"
                aria-label="Upload image for analysis"
              />
            </label>

            {/* Preview */}
            <AnimatePresence>
              {previewUrl && (
                <M.div
                  key="preview"
                  {...FADE_UP}
                  className="mt-4 rounded-xl overflow-hidden border border-white/10 bg-forge-bg max-h-56 flex justify-center"
                >
                  <img
                    src={previewUrl}
                    alt="Selected upload preview"
                    className="max-h-56 max-w-full object-contain"
                  />
                </M.div>
              )}
            </AnimatePresence>

            {/* Prompt target */}
            <div className="mt-5">
              <p className="text-[10px] font-sans font-medium text-forge-muted uppercase tracking-widest mb-2.5">
                Prompt target
              </p>
              <SegmentedControl
                options={PROMPT_TARGETS}
                value={imageModel}
                onChange={setImageModel}
                ariaLabel="Prompt target for image analysis"
              />
            </div>

            {/* Analysis model selector */}
            <div className="mt-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-sans font-medium text-forge-muted uppercase tracking-widest">
                  Analysis model
                </span>
                <select
                  value={analysisProvider}
                  onChange={e => {
                    setAnalysisProvider(e.target.value)
                    setImageResult(null)
                    setImageError('')
                  }}
                  className="bg-forge-bg border border-white/10 text-forge-ink text-xs font-sans rounded-lg px-3 py-2 focus:outline-none focus:border-forge-amber/40 transition-colors"
                  aria-label="Image analysis model"
                >
                  {ANALYSIS_MODELS.map(m => (
                    <option key={m.value} value={m.value}>
                      {m.provider} — {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Analyze button */}
            <button
              type="button"
              onClick={handleImageAnalyze}
              disabled={!selectedFile || imageLoading}
              className={btnPrimary + ' mt-5'}
              aria-label={imageLoading ? 'Analyzing image, please wait' : 'Analyze image'}
            >
              {imageLoading
                ? <><Spinner size={14} /><span>Analyzing…</span></>
                : 'Analyze image'
              }
            </button>

            {imageError && (
              <div className="mt-3"><ErrorBox message={imageError} /></div>
            )}
          </div>

          {/* Analysis result */}
          <AnimatePresence>
            {imageResult && !imageLoading && (
              <M.div key="img-result" {...FADE_UP} className="mt-4">
                <div className="bg-forge-panel/60 border border-white/10 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-sans font-medium text-forge-amber uppercase tracking-widest">
                        Extracted prompt
                      </span>
                      {imageResult.analysis_provider_name && (
                        <span className="text-[10px] font-sans text-forge-cyan border border-forge-cyan/25 rounded-full px-2.5 py-0.5 self-start leading-none">
                          {imageResult.analysis_provider_name} · {imageResult.analysis_model_name}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          `POSITIVE:\n${imageResult.positive_prompt}\n\nNEGATIVE:\n${imageResult.negative_prompt}`,
                          'Both prompts copied',
                        )
                      }
                      className={btnGhost}
                    >
                      Copy both
                    </button>
                  </div>
                  <p className="font-mono text-[11px] text-forge-ink leading-relaxed whitespace-pre-wrap break-words">
                    {imageResult.positive_prompt}
                  </p>
                  <NegativePromptToggle
                    text={imageResult.negative_prompt}
                    onCopy={copyText}
                  />
                </div>
              </M.div>
            )}
          </AnimatePresence>
        </section>

      </main>

      {/* Toast */}
      <AnimatePresence>
        {copied && <Toast key="toast" message={copied} />}
      </AnimatePresence>

    </div>
  )
}

export default App
