import assert from 'node:assert/strict'
import test from 'node:test'

import { choose, commit, freshState, observe, parseReport } from '../src/decide.js'
import { merit } from '../src/merit.js'
import { install, selectParent, mutateChild } from '../src/plugin.js'
import { buildInstruction } from '../src/prompt.js'

test('merit matches Organon: -5 beats -20, and 0 is a failed evaluation', () => {
  assert.ok(merit(-5) > merit(-20))
  assert.equal(merit(0), 0)
  assert.equal(merit(12), 12)
})

test('a better child becomes the incumbent and the next residual parent', () => {
  let state = freshState('c000000', 10)
  state = observe(state, { id: 'c000001', fitness: 14, behavior: 'greedy', editClass: 'greedy' })
  assert.equal(state.incumbent, 'c000001')
  assert.equal(state.mode, 'climb')
  const choice = choose(state)
  assert.equal(choice.parentId, 'c000001')
  assert.equal(choice.mode, 'residual')
})

test('one flat candidate stays on the incumbent', () => {
  let state = freshState('c000000', 10)
  state = commit(state, choose(state))
  state = observe(state, { id: 'c000001', fitness: 10, behavior: 'greedy', editClass: 'greedy' }, { m: 3 })
  assert.equal(state.mode, 'climb')
  assert.equal(choose(state).parentId, 'c000000')
  assert.equal(choose(state).mode, 'residual')
})

test('a mixed cell that is still short of m keeps the incumbent and names that cell', () => {
  let state = freshState('c000000', 10)
  state = observe(state, { id: 'c000001', fitness: 12, behavior: 'swap', editClass: 'swap' }, { m: 3 })
  state = commit(state, choose(state))
  state = observe(state, { id: 'c000002', fitness: 8, behavior: 'swap', editClass: 'swap' }, { m: 3 })
  assert.equal(state.mode, 'unresolved')
  const choice = choose(state)
  assert.equal(choice.mode, 'focus')
  assert.equal(choice.behavior, 'swap')
  assert.equal(choice.parentId, 'c000001')
})

test('m quiet flats with no new cell open one unread structure from the incumbent', () => {
  let state = freshState('c000000', 10)
  state = commit(state, choose(state))
  for (const id of ['c000001', 'c000002', 'c000003', 'c000004']) {
    state = observe(state, { id, fitness: 10, behavior: 'greedy', editClass: 'greedy' }, { m: 3 })
    state = commit(state, choose(state))
  }
  assert.equal(state.mode, 'hardened')
  assert.equal(state.phase, 'sign-open')
  const choice = choose(state)
  assert.equal(choice.mode, 'open-unconditioned')
  assert.equal(choice.readSource, false)
  assert.equal(choice.parentId, 'c000000')
})

test('two illegal children leave the residual parent', () => {
  let state = freshState('c000000', 10)
  state = commit(state, choose(state))
  state = observe(state, { id: 'c000001', fitness: 0, behavior: 'greedy', editClass: 'greedy' })
  assert.equal(state.mode, 'brittle')
  assert.equal(choose(state).mode, 'fortify')
  state = commit(state, choose(state))
  state = observe(state, { id: 'c000002', fitness: 0, behavior: 'greedy', editClass: 'greedy' })
  assert.equal(state.mode, 'hardened')
  assert.equal(choose(state).mode, 'open-unconditioned')
})

test('a legal new cell that loses the score is the next departure, after the sign pair', () => {
  let state = hardenedState()
  state = commit(state, choose(state))
  state = observe(state, { id: 'c000010', fitness: 9, behavior: 'beam', editClass: 'beam' }, { m: 3 })
  assert.equal(state.phase, 'sign-read')
  assert.equal(choose(state).mode, 'open-conditioned')
  state = commit(state, choose(state))
  state = observe(state, { id: 'c000011', fitness: 9, behavior: 'beam', editClass: 'beam' }, { m: 3 })
  assert.equal(state.sign, 'unconditioned')
  const choice = choose(state)
  assert.equal(choice.mode, 'depart')
  assert.equal(choice.parentId, 'c000010')
})

test('a departure that does not beat the incumbent retires that cell', () => {
  let state = hardenedState()
  state = commit(state, choose(state))
  state = observe(state, { id: 'c000010', fitness: 9, behavior: 'beam', editClass: 'beam' }, { m: 3 })
  state = commit(state, choose(state))
  state = observe(state, { id: 'c000011', fitness: 10, behavior: 'greedy', editClass: 'greedy' }, { m: 3 })
  state = commit(state, choose(state))
  assert.equal(state.issued.mode, 'depart')
  state = observe(state, { id: 'c000012', fitness: 9, behavior: 'beam', editClass: 'beam' }, { m: 3 })
  assert.equal(state.cells.beam.retired, true)
  assert.notEqual(choose(state).parentId, 'c000010')
})

test('a child that beats the incumbent clears the departure queue', () => {
  let state = hardenedState()
  state.departures = [{ parentId: 'c000010', behavior: 'beam' }]
  state.phase = 'run'
  state.sign = 'unconditioned'
  state = observe(state, { id: 'c000012', fitness: 15, behavior: 'beam', editClass: 'beam' })
  assert.equal(state.incumbent, 'c000012')
  assert.equal(state.mode, 'climb')
  assert.deepEqual(state.departures, [])
})

test('epsilon keeps a tiny merit gain on the same parent', () => {
  let state = freshState('c000000', 10)
  state = commit(state, choose(state))
  state = observe(state, { id: 'c000001', fitness: 10.2, behavior: 'greedy', editClass: 'greedy' }, { epsilon: 1 })
  assert.equal(state.incumbent, 'c000000')
  assert.equal(state.mode, 'climb')
})

test('the less visited archive cell is the departure when both are waiting', () => {
  let state = hardenedState()
  state.phase = 'run'
  state.sign = 'unconditioned'
  state.cells.beam = { visits: 3, ups: 0, downs: 1, flats: 1, samples: 2, bestId: 'c000010', bestMerit: 9, retired: false }
  state.cells.anneal = { visits: 0, ups: 0, downs: 1, flats: 1, samples: 1, bestId: 'c000011', bestMerit: 8, retired: false }
  state.departures = [
    { parentId: 'c000010', behavior: 'beam' },
    { parentId: 'c000011', behavior: 'anneal' },
  ]
  assert.equal(choose(state).parentId, 'c000011')
})

test('an illegal baseline asks for a legal output', () => {
  const state = freshState('c000000', 0)
  assert.equal(state.mode, 'legalize')
  assert.equal(choose(state).mode, 'legalize')
})

test('the worker prompt keeps the evolve markers and does not run the evaluator', () => {
  const text = buildInstruction({
    mode: 'open-unconditioned',
    incumbentFitness: 10,
    tried: ['greedy'],
    retired: ['beam'],
  })
  assert.match(text, /#EVOLVE_START/)
  assert.match(text, /official evaluator/)
  assert.match(text, /Do not tune that algorithm/)
  assert.match(text, /beam/)
})

test('parseReport reads the two closing lines', () => {
  const parsed = parseReport('done\nEDIT_CLASS: beam_search\nBEHAVIOR: beam search\n')
  assert.equal(parsed.editClass, 'beam_search')
  assert.equal(parsed.behavior, 'beam_search')
})

test('select follows a recorded improvement, and dispose restores the previous providers', async () => {
  const rows = [
    { id: 'c000000', parent: null, fitness: 10, survival: 'yes' },
    { id: 'c000001', parent: 'c000000', fitness: 14, survival: 'yes' },
  ]
  const evolve = fakeEvolve(rows)
  evolve.files.map.set('vns-parent/reports/c000001.json', '{"editClass":"greedy","behavior":"greedy"}\n')
  const handle = install(evolve)
  assert.deepEqual(evolve.stacks.select.map(item => item.name), ['vns-parent-select'])
  const parent = await evolve.stacks.select[0].select(evolve.population(), evolve)
  assert.equal(parent, 'c000001')
  handle.dispose()
  assert.deepEqual(evolve.stacks.select, [])
  assert.deepEqual(evolve.stacks.mutate, [])
})

test('mutate allocates the selected parent and stores the worker report', async () => {
  const rows = [{ id: 'c000000', parent: null, fitness: 10, survival: 'yes' }]
  const evolve = fakeEvolve(rows)
  await selectParent(evolve.population(), evolve)
  const candidate = await mutateChild({ parent: 'c000000' }, evolve)
  assert.equal(candidate.id, 'c000001')
  assert.equal(evolve.allocated, 'c000000')
  const report = JSON.parse(evolve.files.map.get('vns-parent/reports/c000001.json'))
  assert.equal(report.editClass, 'beam_search')
  assert.match(evolve.prompt, /residual change/)
})

function hardenedState() {
  let state = freshState('c000000', 10)
  state = commit(state, choose(state))
  for (const id of ['c000001', 'c000002', 'c000003', 'c000004']) {
    state = observe(state, { id, fitness: 10, behavior: 'greedy', editClass: 'greedy' }, { m: 3 })
    if (id !== 'c000004') state = commit(state, choose(state))
  }
  return state
}

function fakeEvolve(rows) {
  const stacks = { select: [], mutate: [] }
  const map = new Map()
  return {
    stacks,
    allocated: null,
    prompt: '',
    register(slot, provider) {
      stacks[slot].push(provider)
      return () => {
        const index = stacks[slot].indexOf(provider)
        if (index >= 0) stacks[slot].splice(index, 1)
      }
    },
    population() {
      return { rows: async () => rows }
    },
    files: {
      map,
      async read(path) {
        return map.get(path)
      },
      async write(path, text) {
        map.set(path, text)
        return path
      },
    },
    async allocate(parent) {
      this.allocated = parent
      return { id: 'c000001', dir: 'C:\\unused\\c000001' }
    },
    async spawnWorker(_dir, prompt) {
      this.prompt = prompt
      return { text: 'EDIT_CLASS: beam_search\nBEHAVIOR: beam_search\n' }
    },
    currentRun() {
      return { signal: { aborted: false } }
    },
  }
}
