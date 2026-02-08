// electron.vite.config.ts
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
var __electron_vite_injected_import_meta_url = "file:///Users/ibrahim/Developer/Code/Rayna/electron.vite.config.ts";
var __filename = fileURLToPath(__electron_vite_injected_import_meta_url);
var __dirname = dirname(__filename);
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src")
      }
    },
    plugins: [
      TanStackRouterVite({
        routesDirectory: resolve(__dirname, "src/renderer/src/routes"),
        generatedRouteTree: resolve(__dirname, "src/renderer/src/routeTree.gen.ts")
      }),
      react(),
      tailwindcss()
    ]
  }
});
export {
  electron_vite_config_default as default
};
