/**
 * Worker instructions for one parent mode.
 * The editable region and the official evaluator stay on Organon's side of the line.
 */

const TAIL = [
  'Edit only the solution code between the #EVOLVE_START and #EVOLVE_END markers. Leave every other file, and every line outside the markers, unchanged.',
  'Implement one complete candidate in this directory. Do not run the task\'s official evaluator.',
  'End your final message with exactly these two lines:',
  'EDIT_CLASS: snake_name',
  'BEHAVIOR: short_name',
  'Use your own names. Do not use local, explore, unlabeled, or snake_name.',
].join('\n')

/**
 * @param {object} args
 * @param {string} args.mode
 * @param {string|null} [args.behavior]
 * @param {number} [args.incumbentFitness]
 * @param {string[]} [args.tried]
 * @param {string[]} [args.retired]
 * @returns {string}
 */
export function buildInstruction(args) {
  const lines = []
  if (typeof args.incumbentFitness === 'number' && Number.isFinite(args.incumbentFitness)) {
    lines.push(`The official score to beat is ${formatFitness(args.incumbentFitness)}. A candidate that does not beat it does not become the score bar.`)
  }
  lines.push(body(args))
  const tried = (args.tried ?? []).filter(name => name && name !== 'unlabeled')
  const retired = (args.retired ?? []).filter(Boolean)
  if (tried.length > 0) lines.push(`Behaviors already seen on this task: ${tried.join(', ')}.`)
  if (retired.length > 0) lines.push(`Structures already retired on this task: ${retired.join(', ')}. Do not repeat them.`)
  lines.push(TAIL)
  return lines.join('\n\n')
}

export function persona() {
  return 'You are a solution worker in an evolutionary search. Implement the single change named in the instruction. IMPLEMENT A SINGLE SOLUTION. DO NOT ATTEMPT MULTIPLE SOLUTIONS.'
}

/**
 * @param {number} fitness
 * @returns {string}
 */
function formatFitness(fitness) {
  return Number.isInteger(fitness) ? String(fitness) : String(Number(fitness.toFixed(6)))
}

/**
 * @param {{ mode: string, behavior?: string|null }} args
 * @returns {string}
 */
function body(args) {
  switch (args.mode) {
    case 'legalize':
      return 'The current program has no legal official score. Change the marked region so this program produces a legal output. Stop once that output is legal.'
    case 'fortify':
      return 'The current program has a legal score, and small edits have been destroying that output. Change only what is required to keep a legal output. Do not chase a higher score in this candidate.'
    case 'focus':
      return `Keep the behavior that already scores. Make one residual change aimed at the behavior "${args.behavior ?? 'unlabeled'}". Leave the rest of the marked region in place.`
    case 'open-unconditioned':
      return 'The file in this directory is a copy of the score-bar program, so the task files stay intact. Do not tune that algorithm and do not extend it. Replace the marked region with one new structure.'
    case 'open-conditioned':
      return 'You may read the algorithm in the marked region. Replace that region with a different structure. A parameter change to the current algorithm is not a new structure.'
    case 'depart':
      return `This directory is a copy of an archived program, not the score-bar program. Make one residual change to this archived program, aimed at "${args.behavior ?? 'its current behavior'}".`
    default:
      return 'Read the parent solution. Keep the behavior that already scores, and make one residual change inside the marked region.'
  }
}
