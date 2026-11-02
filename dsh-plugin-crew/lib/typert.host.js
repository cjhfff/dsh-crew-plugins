/** Host metadata consumed automatically by the official dsh-typert-loader. */
import crewRemote from './typert.remote-client.js'
export const TYPERT = {
  package: 'dsh-plugin-crew',
  face: 'host',
  schemas: [],
  get invocations() { return crewRemote.descriptors },
  model: { services: [], events: [], objects: [] },
}
