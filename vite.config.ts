import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // The Cloudflare plugin runs the game server (Worker + Durable Objects) inside the dev server too.
  plugins: [react(), tailwindcss(), cloudflare()],
  server: {
    // Expose on the local network so phones on the same Wi-Fi can join.
    host: true,
  },
})
