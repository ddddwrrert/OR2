/**
 * Same ranking Organon uses in population.js.
 * A fitness of 0 is a failed evaluation. A minimize task stores negative scores,
 * and -5 beats -20, so those count as 1/|fitness|. Bigger merit is better.
 * @param {number} fitness
 * @returns {number}
 */
export function merit(fitness) {
  if (typeof fitness !== 'number' || !Number.isFinite(fitness) || fitness === 0) return 0
  return fitness > 0 ? fitness : -1 / fitness
}
