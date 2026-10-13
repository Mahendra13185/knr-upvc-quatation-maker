import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "KNR UPVC Quotation Maker",
        short_name: "KNR UPVC",
        description: "Windows and doors quotation maker",
        theme_color: "#174b96",
        background_color: "#f4f6fa",
        display: "standalone",
        start_url: "/",
        icons: []
      },
      workbox: { globPatterns: ["**/*.{js,css,html,ico,png,svg}"] }
    })
  ]
});