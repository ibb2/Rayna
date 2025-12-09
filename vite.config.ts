import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import TanStackRouterPlugin from '@tanstack/router-plugin/vite'


const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        // Map the '@' prefix to the renderer source folder so imports like '@/components/..' work
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [
      react(),
      tailwindcss(),
      TanStackRouterPlugin({
        routesDirectory: resolve(__dirname, 'src/renderer/src/routes'),
        generatedRouteTree: resolve(__dirname, 'src/renderer/src/routeTree.gen.ts')
      })
    ]
  }
})
