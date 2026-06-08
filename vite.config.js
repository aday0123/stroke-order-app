import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/stroke-order-app/', // !!! 這裡改成你的 GitHub Repository 名字 !!!
})
