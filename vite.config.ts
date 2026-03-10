import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://cyphalcloud.zubax.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/cf3d/api/v1'),
        secure: true,
      },
    },
  },
})
