import http from 'http'

export class LoopbackAuthServer {
    private server: http.Server | null = null
    private port: number = 0
    public onRedirect: (() => void) | null = null

    constructor() {
        this.server = http.createServer((req, res) => this.handleRequest(req, res))
    }

    public listen(): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                reject(new Error('Server not initialized'))
                return
            }

            this.server.listen(0, '127.0.0.1', () => {
                const address = this.server?.address()
                if (address && typeof address !== 'string') {
                    this.port = address.port
                    console.log(`Loopback server listening on port ${this.port}`)
                    resolve(this.port)
                } else {
                    reject(new Error('Failed to get server port'))
                }
            })

            this.server.on('error', (err) => {
                reject(err)
            })
        })
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        // Only handle /callback requests
        if (req.url && req.url.startsWith('/callback')) {
            // Just a simple HTML page that closes itself and/or redirects
            // Trigger the onRedirect callback if set
            if (this.onRedirect) {
                this.onRedirect()
            }

            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authenticated</title>
          <style>
            body { background: #1a1a1a; color: #fff; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .container { text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Successful</h1>
            <p>You can close this window now.</p>
          </div>
          <script>
            // Attempt to switch back to the app using the custom protocol
            window.location.href = 'rayna://auth-callback';
            
            // Optional: Close window after a short delay (might be blocked by browser)
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
        </html>
       `)
        } else {
            res.writeHead(404)
            res.end('Not Found')
        }
    }

    public close() {
        if (this.server) {
            this.server.close(() => {
                console.log('Loopback server closed')
            })
            this.server = null
        }
    }
}
