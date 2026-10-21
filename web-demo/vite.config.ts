import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // The one stylesheet keeps a fixed name. Microsoft Clarity replays a
        // session by fetching the stylesheet URL it recorded; a hashed name is
        // gone after the next deploy (Vercel answers 404 with the HTML page), so
        // older replays showed the site unstyled. Assets are served
        // max-age=0, must-revalidate, so the hash bought no caching.
        assetFileNames: (asset) =>
          (asset.names ?? []).some((n) => n.endsWith('.css')) ? 'assets/site.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    host: true, // listen on 0.0.0.0 so other devices on the LAN (or a tunnel) can reach it
    allowedHosts: true, // needed so Vite doesn't reject requests via an ngrok/tunnel Host header
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
