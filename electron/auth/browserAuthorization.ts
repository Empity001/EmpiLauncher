import { shell } from 'electron'
import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'

const AUTH_TIMEOUT_MS = 5 * 60 * 1000

export type BrowserAuthorizationErrorCode = 'cancelled' | 'provider-error' | 'timeout'

export class BrowserAuthorizationError extends Error {
  readonly code: BrowserAuthorizationErrorCode

  constructor(
    code: BrowserAuthorizationErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BrowserAuthorizationError'
    this.code = code
  }
}

interface BrowserAuthorizationResult {
  code: string
  redirectUri: string
}

function finishPage(title: string, message: string) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <title>${title}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111311; color: #f3f5f1; font: 16px/1.5 system-ui, sans-serif; }
      main { width: min(460px, calc(100% - 40px)); }
      p { color: #b9c0b9; }
    </style>
  </head>
  <body><main><h1>${title}</h1><p>${message}</p></main></body>
</html>`
}

function closeServer(server: Server) {
  return new Promise<void>((resolve) => server.close(() => resolve()))
}

export async function authorizeInBrowser(
  createAuthorizationUrl: (redirectUri: string, state: string) => Promise<string>,
): Promise<BrowserAuthorizationResult> {
  const state = randomBytes(32).toString('hex')
  let settle: ((result: BrowserAuthorizationResult) => void) | undefined
  let fail: ((error: Error) => void) | undefined

  const callback = new Promise<BrowserAuthorizationResult>((resolve, reject) => {
    settle = resolve
    fail = reject
  })

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const returnedState = requestUrl.searchParams.get('state')
    const code = requestUrl.searchParams.get('code')
    const providerError = requestUrl.searchParams.get('error')
    const providerDescription = requestUrl.searchParams.get('error_description')

    response.setHeader('Content-Type', 'text/html; charset=utf-8')

    if (returnedState !== state) {
      response.statusCode = 400
      response.end(finishPage('Solicitud no valida', 'Vuelve a EmpiLauncher e intentalo otra vez.'))
      fail?.(new BrowserAuthorizationError('provider-error', 'Microsoft returned an invalid state.'))
      return
    }

    if (providerError) {
      response.statusCode = 400
      response.end(finishPage('Acceso cancelado', 'Ya puedes volver a EmpiLauncher.'))
      fail?.(new BrowserAuthorizationError(
        providerError === 'access_denied' ? 'cancelled' : 'provider-error',
        `${providerError}: ${providerDescription ?? 'No details provided.'}`,
      ))
      return
    }

    if (!code) {
      response.statusCode = 400
      response.end(finishPage('Falta el codigo', 'Vuelve a EmpiLauncher e intentalo otra vez.'))
      fail?.(new BrowserAuthorizationError('provider-error', 'Microsoft did not return a code.'))
      return
    }

    response.end(finishPage('Cuenta conectada', 'Ya puedes cerrar esta pestana y volver a EmpiLauncher.'))
    settle?.({ code, redirectUri: `http://localhost:${(server.address() as { port: number }).port}` })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const port = (server.address() as { port: number }).port
  const redirectUri = `http://localhost:${port}`
  const timeout = setTimeout(() => {
    fail?.(new BrowserAuthorizationError('timeout', 'Microsoft login timed out.'))
  }, AUTH_TIMEOUT_MS)

  try {
    await shell.openExternal(await createAuthorizationUrl(redirectUri, state))
    return await callback
  } finally {
    clearTimeout(timeout)
    await closeServer(server)
  }
}
