import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // <--- 新增這行

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // <--- 新增這行
  ],
  base: '/stroke-order-app/', // 確保這裡還是你的 GitHub Repository 名稱
})