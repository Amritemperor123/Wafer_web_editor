import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:4000',
        '/ws': {
          target: env.VITE_DEV_WS_PROXY_TARGET ?? 'ws://localhost:4000',
          ws: true,
        },
      },
    },
  }
})
