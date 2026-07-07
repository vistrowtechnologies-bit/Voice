import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Builds a single, dependency-free <script> file (IIFE — no imports, no
// module preloads) so a customer's website can drop it in with one tag and
// nothing else. No code-splitting: a widget script must be one request.
export default defineConfig({
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/widget.ts'),
      name: 'ArthaleVoiceWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
