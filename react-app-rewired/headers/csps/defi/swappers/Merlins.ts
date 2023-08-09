import type { Csp } from '../../../types'

export const csp: Csp = {
  'connect-src': [process.env.REACT_APP_MERLINS_NODE_URL!, process.env.REACT_APP_COSMOS_NODE_URL!],
}
