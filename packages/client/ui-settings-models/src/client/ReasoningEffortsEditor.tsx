/**
 * The per-model reasoning-effort editor of one pi-ai model row.
 *
 * pi-ai exposes thinking depth as selectable *levels* (`off` … `max`), and a
 * profile entry declares the levels it offers as a keyed map whose values are
 * the wire spellings sent to the gateway (`{ off: null, high: 'high' }` ->
 * the request omits the thinking option when off is picked and sends
 * `reasoning_effort: high` for high). This editor writes that map; the
 * composer's model picker then offers exactly the declared levels, which is
 * why it lives here rather than as a provider-scoped control — models under
 * one provider disagree about reasoning, so only a per-model editor can be
 * honest.
 *
 * Three positions, matching the three legal schema values:
 *  - inherit: no `reasoningEfforts` key at all — the installed catalog
 *    capability (or, for a hand-declared route, nothing),
 *  - disabled: the key is `false` — an explicitly non-reasoning model,
 *  - levels: the key is the dict this editor composes.
 *
 * The validation here mirrors `llm-pi-ai`'s catalog resolver so the card can
 * refuse a bad map in place instead of learning it from the host's refusal:
 * the dict must declare at least one level beyond `off`; only `off` may be
 * valueless (meaning "supported, send nothing"); every other level needs the
 * wire spelling it sends.
 */

import type { ReactNode } from 'react'
import type { en } from './locales.ts'
import type { DeepSeekModelsValidationFailure } from './DeepSeekModelsEditor.tsx'
import { validateDeepSeekModels } from './DeepSeekModelsEditor.tsx'
import styles from './ModelsSection.module.css'

/** Every pi-ai thinking level, in pi-ai's canonical escalation order. */
export const REASONING_LEVELS = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
] as const
export type ReasoningLevel = (typeof REASONING_LEVELS)[number]

/** The `reasoningEfforts` profile value this editor can produce. */
export type ReasoningEffortsDraft = false | Partial<Record<ReasoningLevel, string | null>>

/** A localized refusal for one model's reasoning map. */
export type ReasoningEffortsValidationKey =
  | 'modelReasoningEmpty'
  | 'modelReasoningNoLevel'
  | 'modelReasoningWireMissing'

/** One model-level reasoning failure, named by its row for the card footer. */
export type PiAiModelValidationFailure =
  | DeepSeekModelsValidationFailure
  | { index: number; key: ReasoningEffortsValidationKey }

/** The three editing positions, as the mode select's option values. */
type EffortsMode = 'inherit' | 'disabled' | 'levels'

/** Whether `value` is the dict form this editor composes. */
function isDict(value: unknown): value is Partial<Record<ReasoningLevel, string | null>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The editing mode the stored value selects. */
export function reasoningEffortsMode(value: unknown): EffortsMode {
  if (value === false) return 'disabled'
  return isDict(value) ? 'levels' : 'inherit'
}

/**
 * The wire text one level shows: a string wire as-is, `null` (only legal on
 * `off`) as the empty "send nothing" spelling, and an absent level as
 * `undefined` — the distinction that decides whether a level is offered.
 */
function wireOf(value: unknown, level: ReasoningLevel): string | undefined {
  if (!isDict(value)) return undefined
  const wire = value[level]
  if (wire === null) return ''
  if (typeof wire === 'string') return wire
  return undefined
}

/**
 * Validate one model's `reasoningEfforts` against the adapter's constraints.
 * The checks mirror `llm-pi-ai` catalog resolution so a value this editor
 * writes is a value the adapter accepts; `undefined` (inherit) and `false`
 * (disabled) pass unchanged.
 * @param value - the row's `reasoningEfforts`, or undefined when inherited.
 * @returns a localized refusal key, or undefined when the adapter accepts it.
 */
export function validateReasoningEfforts(value: unknown): ReasoningEffortsValidationKey | undefined {
  if (value === false || value === undefined) return undefined
  if (!isDict(value)) return 'modelReasoningWireMissing'
  const entries = Object.entries(value)
  if (entries.length === 0) return 'modelReasoningEmpty'
  // Only `off` may stand alone: without a thinking level the map would be a
  // non-reasoning model that forgot to say so (`false` is the honest form).
  const thinking = entries.filter(([level]) => level !== 'off')
  if (thinking.length === 0) return 'modelReasoningNoLevel'
  for (const [, wire] of thinking) {
    // A level this schema allows only as a string, and the adapter sends the
    // spelling verbatim, so an empty or whitespace spelling is no dispatch.
    if (typeof wire !== 'string' || wire.trim().length === 0) return 'modelReasoningWireMissing'
  }
  // `off` may be valueless (null) but never an empty string, matching
  // `llm-pi-ai`'s "must not be an empty string" refusal.
  const off = value['off']
  if (typeof off === 'string' && off.length === 0) return 'modelReasoningWireMissing'
  return undefined
}

/**
 * The per-row gate for a pi-ai `models` array: the shared id/name/capacity
 * checks, then each row's reasoning map. The editor cards gate their submit
 * on this so a bad map is refused here, naming its row, rather than by the
 * host at save time.
 * @param value - the user-owned `models` array, or undefined while inherited.
 * @returns the first failed row, or undefined when every row is writable.
 */
export function validatePiAiModelEntries(value: unknown): PiAiModelValidationFailure | undefined {
  const base = validateDeepSeekModels(value)
  if (base !== undefined) return base
  if (!Array.isArray(value)) return undefined
  for (const [index, model] of value.entries()) {
    const reasoningEfforts = typeof model === 'object' && model !== null
      ? (model as Record<string, unknown>)['reasoningEfforts']
      : undefined
    const failure = validateReasoningEfforts(reasoningEfforts)
    if (failure !== undefined) return { index, key: failure }
  }
  return undefined
}

/** Props of {@link ReasoningEffortsEditor}. */
export interface ReasoningEffortsEditorProps {
  /** The row's `reasoningEfforts` value (undefined, false, or a dict). */
  value: unknown
  /** Replace the row's value; `undefined` returns it to inheritance. */
  onChange: (next: ReasoningEffortsDraft | undefined) => void
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Disable every control. */
  disabled: boolean
  /** 1-based row position, for the controls' aria-labels. */
  index: number
}

/**
 * Render one model row's reasoning-effort editor: the inherit/disabled/levels
 * mode select, and the level rows that compose the dict when levels win.
 * @param props - the stored value, the write path, copy, and row position.
 * @returns the reasoning-effort editor.
 */
export function ReasoningEffortsEditor(props: ReasoningEffortsEditorProps): ReactNode {
  const { value, onChange, t, disabled, index } = props
  const mode = reasoningEffortsMode(value)
  // A fresh dict the levels position drafts into; never written until changed.
  const dict = isDict(value) ? value : {}

  const setValue = (next: Partial<Record<ReasoningLevel, string | null>>): void => {
    onChange({ ...next })
  }

  /** Toggle one level in or out of the offered set. */
  const toggleLevel = (level: ReasoningLevel): void => {
    const next = { ...dict }
    if (level in next) {
      Reflect.deleteProperty(next, level)
    } else if (level === 'off') {
      // `off` offered with no value means "supported, send nothing".
      next.off = null
    } else {
      // The level's own id is the usual wire spelling; the user edits it when
      // the gateway wants something else. This keeps every state on the board
      // valid the moment it is checkmarked.
      next[level] = level
    }
    setValue(next)
  }

  /** Change one level's wire spelling. */
  const setWire = (level: ReasoningLevel, text: string): void => {
    const next = { ...dict }
    const trimmed = text.trim()
    if (level === 'off') {
      // Empty spells the valueless `off` — the adapter's only legal absence —
      // rather than an empty string, which the adapter refuses.
      next.off = trimmed.length === 0 ? null : trimmed
    } else {
      // Kept raw so the field shows what was typed; the validator treats a
      // whitespace-only spelling as missing.
      next[level] = text
    }
    setValue(next)
  }

  const levelRow = (level: ReasoningLevel): ReactNode => {
    const wire = wireOf(dict, level)
    const offered = wire !== undefined
    const checkboxLabel = t('reasoningLevelToggle')
    const wireLabel = `${t('reasoningWireLabel')} ${level} ${String(index)}`
    return (
      <label className={styles['modelReasoningLevel']} key={level}>
        <input
          type="checkbox"
          checked={offered}
          aria-label={`${checkboxLabel} ${level} ${String(index)}`}
          disabled={disabled}
          onChange={() => { toggleLevel(level) }}
        />
        <span className={styles['modelReasoningLevelName']}>{level}</span>
        <input
          className={styles['input']}
          type="text"
          value={wire ?? ''}
          placeholder={level === 'off' ? '—' : level}
          aria-label={wireLabel}
          disabled={disabled || !offered}
          onChange={(event) => { setWire(level, event.target.value) }}
        />
      </label>
    )
  }

  return (
    <div className={styles['modelReasoning']}>
      <span className={styles['modelFieldLabel']}>{t('modelReasoning')}</span>
      <select
        className={`${styles['input']} ${styles['selectInput']}`}
        value={mode}
        aria-label={`${t('modelReasoning')} ${String(index)}`}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value as EffortsMode
          if (next === 'inherit') onChange(undefined)
          else if (next === 'disabled') onChange(false)
          // The levels position opens on a map the adapter accepts: `off` and
          // a high level, so a checkmarked-but-unfilled board still applies.
          else onChange({ off: null, high: 'high' })
        }}
      >
        <option value="inherit">{t('reasoningInherit')}</option>
        <option value="disabled">{t('reasoningDisabled')}</option>
        <option value="levels">{t('reasoningLevels')}</option>
      </select>
      {mode === 'levels'
        ? (
          <div className={styles['modelReasoningLevels']}>
            <p className={styles['advancedHint']}>{t('reasoningHint')}</p>
            {REASONING_LEVELS.map(levelRow)}
          </div>
        )
        : null}
    </div>
  )
}
