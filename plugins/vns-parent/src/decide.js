/**
 * Parent-state machine for one Organon candidate at a time.
 *
 * The official incumbent is the best merit seen on this run. The mutation parent
 * is chosen separately: residual while the neighborhood still moves, one
 * legality repair when it is brittle, one unread structural opening when it
 * has gone quiet. A child replaces the incumbent only by scoring higher.
 */

import { merit } from './merit.js'

const OPEN_MODES = new Set(['open-unconditioned', 'open-conditioned'])

/**
 * @param {string} baselineId
 * @param {number} [baselineFitness]
 */
export function freshState(baselineId, baselineFitness = 0) {
  const incumbentMerit = merit(baselineFitness)
  return {
    incumbent: baselineId,
    incumbentMerit,
    mode: incumbentMerit > 0 ? 'climb' : 'legalize',
    phase: 'run',
    sign: 'pending',
    flatRun: 0,
    brittleRun: 0,
    quiet: 0,
    issued: null,
    departures: [],
    cells: {},
    retiredEdits: [],
    seen: [],
    signOutcome: {},
  }
}

/**
 * Fold one evaluated child into the parent state.
 * The baseline row itself is not an event.
 * @param {object} state
 * @param {{ id: string, fitness: number, behavior?: string, editClass?: string }} event
 * @param {{ m?: number, epsilon?: number }} [options]
 */
export function observe(state, event, options = {}) {
  const m = options.m ?? 3
  const epsilon = options.epsilon ?? 0
  const s = structuredClone(state)
  const behavior = cleanName(event.behavior)
  const editClass = cleanName(event.editClass)
  const childMerit = merit(event.fitness)
  const legal = childMerit > 0
  const improved = legal && childMerit > s.incumbentMerit + epsilon
  const worse = legal && childMerit + epsilon < s.incumbentMerit
  const cell = ensureCell(s, behavior)
  const isNew = cell.samples === 0
  cell.samples += 1
  if (legal && improved) cell.ups += 1
  else if (worse) cell.downs += 1
  else if (legal) cell.flats += 1
  if (legal && (cell.bestId === null || childMerit > cell.bestMerit)) {
    cell.bestId = event.id
    cell.bestMerit = childMerit
  }

  const helped = improved || (legal && isNew)
  if (s.phase === 'sign-open' || s.phase === 'sign-read') {
    s.signOutcome[s.phase] = { helped, editClass, id: event.id }
  }

  if (improved) return climbTo(s, event.id, childMerit)

  if (!legal && s.incumbentMerit > 0) s.brittleRun += 1
  if (legal && !improved) {
    s.brittleRun = 0
    s.flatRun += 1
    s.quiet = isNew ? 0 : s.quiet + 1
  }

  if (OPEN_MODES.has(s.issued?.mode) && legal && isNew) {
    pushDeparture(s, event.id, behavior)
  }
  if (s.issued?.mode === 'depart' && !improved) {
    const departed = s.cells[s.issued.behavior]
    if (departed) departed.retired = true
  }

  if (s.phase === 'sign-open' || s.phase === 'sign-read') return finishSign(s)

  if (hasUnresolved(s, m)) s.mode = 'unresolved'
  else if (s.brittleRun >= 2 || (s.flatRun >= m && s.quiet >= m && allSeparated(s, m))) s.mode = 'hardened'
  else if (s.brittleRun >= 1) s.mode = 'brittle'
  else if (s.incumbentMerit === 0) s.mode = 'legalize'
  else s.mode = 'climb'

  if (s.mode === 'hardened' && s.sign === 'pending' && s.phase === 'run') s.phase = 'sign-open'
  return s
}

/**
 * @param {object} state
 * @returns {{ parentId: string, mode: string, readSource: boolean, behavior: string|null }}
 */
export function choose(state) {
  if (state.phase === 'sign-read') {
    return openChoice(state, true)
  }
  if (state.phase === 'sign-open') {
    return openChoice(state, false)
  }
  const departure = pickDeparture(state)
  if (departure) {
    return {
      parentId: departure.parentId,
      mode: 'depart',
      readSource: true,
      behavior: departure.behavior,
    }
  }
  if (state.mode === 'legalize') {
    return { parentId: state.incumbent, mode: 'legalize', readSource: true, behavior: null }
  }
  if (state.mode === 'brittle') {
    return { parentId: state.incumbent, mode: 'fortify', readSource: true, behavior: null }
  }
  if (state.mode === 'unresolved') {
    return {
      parentId: state.incumbent,
      mode: 'focus',
      readSource: true,
      behavior: unresolvedBehavior(state),
    }
  }
  if (state.mode === 'hardened') return openChoice(state, state.sign === 'conditioned')
  return { parentId: state.incumbent, mode: 'residual', readSource: true, behavior: null }
}

/**
 * Record that this choice is the one the next child will answer.
 * A departure spends its queue slot and counts one visit.
 * @param {object} state
 * @param {{ parentId: string, mode: string, behavior: string|null }} choice
 */
export function commit(state, choice) {
  const s = structuredClone(state)
  s.issued = choice
  if (choice.mode === 'depart') {
    const cell = ensureCell(s, choice.behavior ?? 'unlabeled')
    cell.visits += 1
    s.departures = (s.departures ?? []).filter(item => item.parentId !== choice.parentId)
  }
  return s
}

/**
 * @param {string} [value]
 * @returns {string}
 */
export function cleanName(value) {
  const name = `${value ?? ''}`.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  if (name === '') return 'unlabeled'
  return name.slice(0, 40)
}

/**
 * @param {string} text
 * @returns {{ editClass: string, behavior: string }}
 */
export function parseReport(text) {
  const edit = /EDIT_CLASS:\s*([A-Za-z0-9_ -]+)/i.exec(text ?? '')
  const behavior = /BEHAVIOR:\s*([A-Za-z0-9_ -]+)/i.exec(text ?? '')
  return {
    editClass: cleanName(edit?.[1]),
    behavior: cleanName(behavior?.[1]),
  }
}

function climbTo(state, id, childMerit) {
  if (state.phase === 'sign-open') state.sign = 'unconditioned'
  else if (state.phase === 'sign-read') {
    const opened = state.signOutcome['sign-open']
    state.sign = opened?.helped ? 'either' : 'conditioned'
  }
  state.incumbent = id
  state.incumbentMerit = childMerit
  state.flatRun = 0
  state.brittleRun = 0
  state.quiet = 0
  state.mode = 'climb'
  state.phase = 'run'
  state.departures = []
  return state
}

function finishSign(state) {
  if (state.phase === 'sign-open') {
    state.phase = 'sign-read'
    return state
  }
  if (state.phase === 'sign-read') {
    const opened = state.signOutcome['sign-open']
    const read = state.signOutcome['sign-read']
    if (opened?.helped && !read?.helped) state.sign = 'unconditioned'
    else if (read?.helped && !opened?.helped) state.sign = 'conditioned'
    else {
      state.sign = 'either'
      if (!opened?.helped) retireEdit(state, opened?.editClass)
      if (!read?.helped) retireEdit(state, read?.editClass)
    }
    state.phase = 'run'
    if (state.mode !== 'climb') state.mode = 'hardened'
  }
  return state
}

function openChoice(state, readSource) {
  return {
    parentId: state.incumbent,
    mode: readSource ? 'open-conditioned' : 'open-unconditioned',
    readSource,
    behavior: null,
  }
}

function ensureCell(state, name) {
  if (!state.cells[name]) {
    state.cells[name] = {
      visits: 0,
      ups: 0,
      downs: 0,
      flats: 0,
      samples: 0,
      bestId: null,
      bestMerit: 0,
      retired: false,
    }
  }
  return state.cells[name]
}

function pushDeparture(state, parentId, behavior) {
  if (parentId === state.incumbent) return
  if ((state.departures ?? []).some(item => item.parentId === parentId)) return
  state.departures.push({ parentId, behavior })
}

function pickDeparture(state) {
  let best = null
  let bestWeight = -1
  for (const item of state.departures ?? []) {
    const cell = state.cells[item.behavior]
    if (!cell || cell.retired) continue
    if (item.parentId === state.incumbent) continue
    const weight = 1 / Math.sqrt(cell.visits + 1)
    if (weight > bestWeight) {
      bestWeight = weight
      best = item
    }
  }
  return best
}

function hasUnresolved(state, m) {
  return Object.values(state.cells).some(cell => (
    !cell.retired && cell.ups > 0 && cell.downs > 0 && cell.samples < m
  ))
}

function allSeparated(state, m) {
  return Object.values(state.cells).every(cell => (
    cell.retired || cell.samples === 0 || !(cell.ups > 0 && cell.downs > 0 && cell.samples < m)
  ))
}

function unresolvedBehavior(state) {
  const found = Object.entries(state.cells)
    .filter(([, cell]) => !cell.retired && cell.ups > 0 && cell.downs > 0)
    .sort((a, b) => a[1].samples - b[1].samples || a[0].localeCompare(b[0]))
  return found[0]?.[0] ?? null
}

function retireEdit(state, editClass) {
  if (!editClass || editClass === 'unlabeled') return
  if (!state.retiredEdits.includes(editClass)) state.retiredEdits.push(editClass)
}
