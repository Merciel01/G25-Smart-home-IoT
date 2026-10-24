import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: "127.0.0.1",
    fs: {
      strict: true,
      deny: [
        "**/.env",
        "**/.env.*",
        "**/.local/**",
        "**/*.key",
        "**/*.pem",
        "**/*.crt",
        "**/.git/**",
        "**/.aws/**",
        "**/.codex/**",
        "**/.agents/**",
      ],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          ethereum: ["ethers"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
