interface Context {
  request: Request
  env: { ANALYSIS_API: { fetch(request: Request): Promise<Response> } }
}

export async function onRequest({ request, env }: Context) {
  try {
    return await env.ANALYSIS_API.fetch(request)
  } catch {
    return Response.json(
      { code: 'api_unavailable', message: 'The analysis service is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
    )
  }
}
