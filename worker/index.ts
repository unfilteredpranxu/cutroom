import { handleRequest, type Env } from './handler'

export { AnalysisQuota } from './quota'

export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env)
  },
}
