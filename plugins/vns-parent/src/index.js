/**
 * Cordis plugin. Loading it registers the parent switch on the evolve service.
 * Stopping it restores the providers that were active before.
 */

import { install } from './plugin.js'

export const name = 'vns-parent'
export const inject = ['evolve']

/**
 * @param {object} ctx
 */
export function apply(ctx) {
  ctx.effect(() => install(ctx.evolve).dispose)
}

export { install } from './plugin.js'
