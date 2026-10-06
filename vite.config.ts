import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 8787)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Expose on the local network so phones on the same Wi-Fi can join.
    host: true,
    proxy: {
      '/ws': { target: `ws://localhost:${SERVER_PORT}`, ws: true },
    },
  },
})
