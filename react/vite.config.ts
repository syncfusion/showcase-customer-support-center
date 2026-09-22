import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import tailwindcss from '@tailwindcss/vite'

const uploaderStubPlugin: Plugin = {
  name: 'syncfusion-uploader-stub',
  configureServer(server) {
    const ok = (
      _req: IncomingMessage,
      res: ServerResponse,
    ): void => {
      res.statusCode = 200
      res.setHeader('content-type', 'text/plain')
      res.end('OK')
    }
    const handler: Connect.NextHandleFunction = (req, res, next) => {
      if (req.url === '/api/uploads/save' && req.method === 'POST') {
        return ok(req, res)
      }
      if (
        (req.url === '/api/uploads/remove' && req.method === 'POST') ||
        (req.url === '/api/uploads/remove' && req.method === 'DELETE')
      ) {
        return ok(req, res)
      }
      return next()
    }
    server.middlewares.use(handler)
  },
}

// https://vite.dev/config/
export default defineConfig({
  base: '/customer-support-sla/react/',
  plugins: [react(), uploaderStubPlugin,tailwindcss()],
   build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          const syncfusionPackage = id.match(/node_modules\/@syncfusion\/([^/]+)/)?.[1];
          if (syncfusionPackage) {
            // Keep each Syncfusion package independently cacheable and avoid
            // sending one large component bundle through the load balancer.
            return `syncfusion-${syncfusionPackage}`;
          }
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          return undefined;
        }
      }
    }
  }
})
