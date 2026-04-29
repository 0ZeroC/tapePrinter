import express from 'express'
import cors from 'cors'
import http from 'http'
import { join } from 'path'
import apiRoutes from './api-routes'
import { networkInterfaces } from 'os'

let serverUrl = ''

export function getServerUrl(): string {
  return serverUrl
}

export function getLocalIP(): string {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return '127.0.0.1'
}

export function startServer(
  port: number,
  staticDir?: string,
  viteDevUrl?: string,
  host = '0.0.0.0'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const app = express()

    app.use(cors())
    app.use(express.json({ limit: '50mb' }))

    app.use('/api', apiRoutes)

    if (staticDir) {
      app.use(express.static(staticDir))
      app.get('/{*splat}', (_req, res) => {
        res.sendFile(join(staticDir, 'index.html'))
      })
    } else if (viteDevUrl) {
      const vite = new URL(viteDevUrl)
      app.use((req, res) => {
        const proxyReq = http.request(
          {
            hostname: vite.hostname,
            port: vite.port,
            path: req.url,
            method: req.method,
            headers: req.headers
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode!, proxyRes.headers)
            proxyRes.pipe(res)
          }
        )
        proxyReq.on('error', () => {
          res.status(502).send('Vite dev server is not available')
        })
        req.pipe(proxyReq)
      })
    }

    const server = app.listen(port, host, () => {
      const ip = getLocalIP()
      serverUrl = `http://${ip}:${port}`
      console.log(`Server running at ${serverUrl}`)
      resolve(serverUrl)
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} in use, trying ${port + 1}...`)
        server.close()
        startServer(port + 1, staticDir, viteDevUrl, host).then(resolve).catch(reject)
      } else {
        reject(err)
      }
    })
  })
}
