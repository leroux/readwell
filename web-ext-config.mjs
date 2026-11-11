// Read automatically by `npx web-ext ...` when run from this folder.
// Keeps everything that isn't part of the extension out of builds and signing.
export default {
  ignoreFiles: [
    "README.md",
    "docs",
    "web-ext-config.mjs",
    "web-ext-artifacts",
    "*.html.bak",
    "test*.html",
  ],
  build: { overwriteDest: true },
  sign: { channel: "unlisted" },
};
