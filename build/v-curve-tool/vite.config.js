import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

function renameOutputHtml() {
  return {
    name: "rename-v-curve-output",
    enforce: "post",
    generateBundle(_options, bundle) {
      const entry = bundle["index.html"];
      if (!entry) return;
      if (typeof entry.source === "string") {
        entry.source = entry.source.replace(/\r\n?/gu, "\n");
      }
      delete bundle["index.html"];
      entry.fileName = "V曲线对比工具.html";
      bundle[entry.fileName] = entry;
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [viteSingleFile(), renameOutputHtml()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]"
      }
    }
  },
  worker: {
    format: "es"
  }
});
