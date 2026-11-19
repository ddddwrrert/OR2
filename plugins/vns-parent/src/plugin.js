/**
 * Organon select and mutate providers.
 * The default loop, evaluator, survival rule, and allocate stay in place.
 * Search memory is written through evolve.files.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { choose, commit, freshState, observe, parseReport } from './decide.js'
import { merit } from './merit.js'
import { buildInstruction, persona } from './prompt.js'

export const STATE_PATH = 'vns-parent/state.json'

/**
 * @param {string} id
 * @returns {string}
 */
export function reportPath(id) {
  return `vns-parent/reports/${id}.json`
}

/**
 * @param {object} evolve
 * @param {{ m?: number, epsilon?: number }} [options]
 * @returns {{ installed: string[], dispose: () => void }}
 */
export function install(evolve, options = {}) {
  const selectProvider = {
    name: 'vns-parent-select',
    select: (population, service) => selectParent(population, service ?? evolve, options),
  }
  const mutateProvider = {
    name: 'vns-parent-mutate',
    mutate: (mutateOptions, service) => mutateChild(mutateOptions, service ?? evolve, options),
  }
  const disposeSelect = evolve.register('select', selectProvider)
  const disposeMutate = evolve.register('mutate', mutateProvider)
  return {
    installed: ['select=vns-parent-select', 'mutate=vns-parent-mutate'],
    dispose() {
      disposeMutate()
      disposeSelect()
    },
  }
}

/**
 * Absorb new population rows, then return the mutation parent id.
 * @param {{ rows: () => Promise<object[]> }} population
 * @param {object} evolve
 * @param {{ m?: number, epsilon?: number }} [options]
 * @returns {Promise<string>}
 */
export async function selectParent(population, evolve, options = {}) {
  const rows = await population.rows()
  if (rows.length === 0) throw new Error('vns-parent: the population is empty')
  let state = await loadState(evolve, rows)
  const seen = new Set(state.seen)
  for (const row of rows) {
    if (row.parent == null || seen.has(row.id)) continue
    const report = await readJson(evolve, reportPath(row.id))
    state = observe(state, {
      id: row.id,
      fitness: row.fitness,
      behavior: report?.behavior,
      editClass: report?.editClass,
    }, options)
    seen.add(row.id)
  }
  state.seen = [...seen]
  const choice = choose(state)
  state = commit(state, choice)
  await evolve.files.write(STATE_PATH, `${JSON.stringify(state)}\n`)
  return choice.parentId
}

/**
 * Allocate one child of the selected parent and brief the worker for the current mode.
 * @param {{ parent?: string, model?: string, allowedTools?: string[], allowShell?: boolean }} mutateOptions
 * @param {object} evolve
 * @param {{ m?: number, epsilon?: number }} [options]
 * @returns {Promise<{ id: string, dir: string }>}
 */
export async function mutateChild(mutateOptions, evolve, options = {}) {
  const parent = mutateOptions?.parent
  if (!parent) throw new Error('mutate needs a parent candidate id')
  const rows = await evolve.population().rows()
  const state = await loadState(evolve, rows)
  const issued = state.issued?.parentId === parent
    ? state.issued
    : { parentId: parent, mode: 'residual', readSource: true, behavior: null }
  const incumbent = rows.find(row => row.id === state.incumbent)
  const instruction = buildInstruction({
    mode: issued.mode,
    behavior: issued.behavior,
    incumbentFitness: incumbent?.fitness,
    tried: Object.keys(state.cells ?? {}),
    retired: state.retiredEdits ?? [],
  })
  const candidate = await evolve.allocate(parent)
  let text = ''
  try {
    const result = await evolve.spawnWorker(candidate.dir, instruction, {
      label: `vns-${issued.mode}`,
      persona: persona(),
      model: mutateOptions.model,
      allowShell: mutateOptions.allowShell ?? true,
      allowedTools: mutateOptions.allowedTools,
    })
    text = result?.text ?? ''
  } catch (error) {
    const current = evolve.currentRun?.()
    if (current?.signal?.aborted) throw error
  }
  const fromFile = await readWorkerNote(candidate.dir)
  const parsed = fromFile ?? parseReport(text)
  await evolve.files.write(reportPath(candidate.id), `${JSON.stringify(parsed)}\n`)
  return candidate
}

/**
 * @param {object} evolve
 * @param {object[]} rows
 */
async function loadState(evolve, rows) {
  const raw = await evolve.files.read(STATE_PATH)
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.incumbent === 'string') return parsed
    } catch {
      // A torn state file starts the parent decision again from the baseline row.
    }
  }
  const baseline = rows.find(row => row.parent == null) ?? rows[0]
  const state = freshState(baseline.id, baseline.fitness)
  state.incumbentMerit = merit(baseline.fitness)
  state.mode = state.incumbentMerit > 0 ? 'climb' : 'legalize'
  return state
}

/**
 * @param {object} evolve
 * @param {string} path
 */
async function readJson(evolve, path) {
  const raw = await evolve.files.read(path)
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * @param {string} dir
 * @returns {Promise<{ editClass: string, behavior: string }|null>}
 */
async function readWorkerNote(dir) {
  try {
    const raw = await readFile(join(dir, 'vns-parent.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return parseReport(`EDIT_CLASS: ${parsed.edit_class ?? parsed.editClass ?? ''}\nBEHAVIOR: ${parsed.behavior ?? ''}`)
  } catch {
    return null
  }
}
