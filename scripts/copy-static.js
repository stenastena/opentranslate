// Copies non-TypeScript renderer assets (HTML/CSS) into dist/, mirroring the
// src/ layout that tsc already produced for the compiled .js files.
const fs = require('fs');
const path = require('path');

const SRC_RENDERER = path.join(__dirname, '..', 'src', 'renderer');
const DIST_RENDERER = path.join(__dirname, '..', 'dist', 'renderer');
const SRC_ASSETS = path.join(__dirname, '..', 'src', 'assets');
const DIST_ASSETS = path.join(__dirname, '..', 'dist', 'assets');
const STATIC_EXTENSIONS = new Set(['.html', '.css']);

function copyStaticFiles(srcDir, destDir, extensions) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyStaticFiles(srcPath, destPath, extensions);
    } else if (!extensions || extensions.has(path.extname(entry.name))) {
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyStaticFiles(SRC_RENDERER, DIST_RENDERER, STATIC_EXTENSIONS);
copyStaticFiles(SRC_ASSETS, DIST_ASSETS, null);
