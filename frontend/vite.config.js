import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // bind to 0.0.0.0 instead of just localhost, so the dev server is
  // reachable from other devices on the LAN (e.g. a phone) at this
  // machine's IP, not only from the machine itself
  server: {
    host: true,
  },
})
