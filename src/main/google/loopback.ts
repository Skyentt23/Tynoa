import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const PAGE = (message: string): string =>
  `<!doctype html><meta charset="utf-8"><title>Tynoa</title>` +
  `<body style="font-family:Segoe UI,system-ui,sans-serif;text-align:center;padding:48px">` +
  `<h1>✦ Tynoa</h1><p>${message}</p></body>`

/**
 * Reçoit la redirection OAuth sur 127.0.0.1 (port libre choisi par le système).
 * Le serveur se ferme dès la première réponse exploitable, ou au bout du délai.
 */
export async function waitForAuthCode(opts: {
  state: string
  timeoutMs: number
}): Promise<{ redirectUri: string; code: Promise<string> }> {
  let resolveCode!: (code: string) => void
  let rejectCode!: (err: Error) => void
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/') {
      res.writeHead(404).end()
      return
    }
    const params = url.searchParams
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    if (params.get('state') !== opts.state) {
      res.end(PAGE('Requête inattendue. Relancer la connexion depuis Tynoa.'))
      finish(new Error('Réponse OAuth inattendue (state invalide)'))
    } else if (params.get('error')) {
      res.end(PAGE('Connexion annulée. Vous pouvez fermer cet onglet.'))
      finish(new Error(`Connexion refusée : ${params.get('error')}`))
    } else if (params.get('code')) {
      res.end(PAGE('Connexion réussie. Vous pouvez fermer cet onglet et revenir à Tynoa.'))
      finish(null, params.get('code')!)
    } else {
      res.end(PAGE('Réponse incomplète. Relancer la connexion depuis Tynoa.'))
      finish(new Error('Réponse OAuth sans code'))
    }
  })

  const timer = setTimeout(() => finish(new Error('Délai de connexion dépassé')), opts.timeoutMs)

  function finish(err: Error | null, value?: string): void {
    clearTimeout(timer)
    server.close()
    if (err) rejectCode(err)
    else resolveCode(value!)
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { redirectUri: `http://127.0.0.1:${port}`, code }
}
