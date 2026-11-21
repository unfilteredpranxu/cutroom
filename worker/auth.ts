export const ownerTokenPattern = /^[A-Za-z0-9_-]{32,128}$/

export async function isOwner(request: Request, secret: string) {
  const authorization = request.headers.get('Authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!ownerTokenPattern.test(token)) return false

  const encode = new TextEncoder()
  const [expected, supplied] = await Promise.all(
    [secret, token].map(async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(value)))),
  )
  let difference = 0
  for (let index = 0; index < expected.length; index++) {
    difference |= expected[index] ^ supplied[index]
  }
  return difference === 0
}
