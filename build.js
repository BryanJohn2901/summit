#!/usr/bin/env node
/**
 * Build de produção — Summit PTA
 * Gera pasta dist/ pronta para deploy estático.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const { minify: minifyJs } = require('terser');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const ASSETS_SRC = path.join(ROOT, 'assets');
const ASSETS_DIST = path.join(DIST, 'assets');
const CANONICAL_BASE = 'https://summit.personaltraineracademy.com.br';

const HTML_PAGES = [
  {
    src: 'index.html',
    out: 'index.html',
    cssOut: 'main.css',
    jsOut: 'main.js',
    title: 'Summit Personal Trainer Academy | Resultados e Elite do Mercado',
    description:
      'A imersão definitiva para o Personal Trainer que busca resultados extraordinários e alto ticket. Domine a elite do mercado e transforme sua carreira.',
    ogImage: `${CANONICAL_BASE}/assets/hero-bg.webp`,
  },
  {
    src: 'patrocinadores.html',
    out: 'patrocinadores.html',
    cssOut: 'patrocinadores.css',
    jsOut: 'patrocinadores.js',
    title: 'Patrocinadores | Summit Personal Trainer Academy',
    description:
      'Conheça as marcas que apoiam o maior evento para personal trainers do Sul do Brasil.',
    ogImage: `${CANONICAL_BASE}/assets/logoSummit.svg`,
  },
];

function log(msg) {
  console.log(`[build] ${msg}`);
}

function rimraf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

async function optimizeAssets() {
  ensureDir(ASSETS_DIST);
  if (!fs.existsSync(ASSETS_SRC)) {
    log('Pasta assets/ não encontrada — pulando cópia.');
    return;
  }

  copyRecursive(ASSETS_SRC, ASSETS_DIST);

  const summitLogo = path.join(ASSETS_DIST, 'logoSummit.svg');
  const ptaLogo = path.join(ASSETS_DIST, 'logoPTA.svg');
  if (!fs.existsSync(ptaLogo) && fs.existsSync(summitLogo)) {
    fs.copyFileSync(summitLogo, ptaLogo);
    log('logoPTA.svg ausente — usando logoSummit.svg como fallback.');
  }

  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    log('sharp indisponível — imagens copiadas sem conversão WebP.');
    return;
  }

  const pngPath = path.join(ASSETS_DIST, 'hero-bg.png');
  if (fs.existsSync(pngPath)) {
    const webpPath = path.join(ASSETS_DIST, 'hero-bg.webp');
    await sharp(pngPath).webp({ quality: 82, effort: 4 }).toFile(webpPath);
    const pngStat = fs.statSync(pngPath);
    const webpStat = fs.statSync(webpPath);
    log(`hero-bg.webp gerado (${Math.round(webpStat.size / 1024)}KB vs PNG ${Math.round(pngStat.size / 1024)}KB)`);
  }
}

function buildTailwind() {
  const outFile = path.join(DIST, 'css', 'tailwind.css');
  ensureDir(path.dirname(outFile));
  execSync(
    `npx tailwindcss -i "${path.join(ROOT, 'build', 'tailwind-input.css')}" -o "${outFile}" --minify`,
    { cwd: ROOT, stdio: 'inherit' }
  );
  let tw = fs.readFileSync(outFile, 'utf8');
  tw = tw.replace(/hero-bg\.png/g, 'hero-bg.webp');
  tw = tw.replace(/url\((['"]?)assets\//g, 'url($1../assets/');
  fs.writeFileSync(outFile, tw);
  log('Tailwind purgado → dist/css/tailwind.css');
}

function fixCssAssetPaths(css) {
  return css
    .replace(/url\((['"]?)assets\//g, "url($1../assets/")
    .replace(/url\((['"]?)assets\/hero-bg\.png/g, "url($1../assets/hero-bg.webp");
}

function minifyCss(css, label) {
  const fixed = fixCssAssetPaths(css);
  const result = new CleanCSS({ level: 2 }).minify(fixed);
  if (result.errors.length) {
    console.warn(`[build] Avisos CSS (${label}):`, result.errors);
  }
  return result.styles;
}

async function minifyJsCode(code, label) {
  const result = await minifyJs(code, {
    compress: { passes: 2 },
    mangle: false,
    format: { comments: false },
  });
  if (result.error) throw result.error;
  return result.code;
}

function extractStyle(html) {
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return match ? match[1].trim() : '';
}

function extractInlineScripts(html) {
  const scripts = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = (m[1] || '').toLowerCase();
    const body = m[2].trim();
    if (attrs.includes('src=')) continue;
    if (attrs.includes('application/ld+json')) continue;
    if (!body) continue;
    if (body.includes('tailwind.config')) continue;
    scripts.push(body);
  }
  return scripts.join('\n\n');
}

function removeTailwindCdn(html) {
  return html
    .replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*/gi, '')
    .replace(/<script>\s*tailwind\.config\s*=[\s\S]*?<\/script>\s*/i, '');
}

function removeInlineStyle(html) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>\s*/i, '');
}

function removeInlineAppScripts(html) {
  return html.replace(/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi, (full, attrs) => {
    const a = (attrs || '').toLowerCase();
    if (a.includes('src=')) return full;
    if (a.includes('application/ld+json')) return full;
    return '';
  });
}

function applySeoHead(html, page) {
  const canonical =
    page.out === 'index.html'
      ? `${CANONICAL_BASE}/`
      : `${CANONICAL_BASE}/${page.out}`;

  let out = html;

  if (!/<title>/i.test(out)) {
    out = out.replace(/<head>/i, `<head>\n    <title>${page.title}</title>`);
  } else {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${page.title}</title>`);
  }

  if (/<meta name="description"/i.test(out)) {
    out = out.replace(
      /<meta name="description"[^>]*>/i,
      `<meta name="description" content="${page.description}">`
    );
  } else {
    out = out.replace(
      /<meta name="viewport"[^>]*>/i,
      `$&\n    <meta name="description" content="${page.description}">`
    );
  }

  out = out.replace(
    /<link rel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${canonical}">`
  );
  if (!/<link rel="canonical"/i.test(out)) {
    out = out.replace(/<meta charset="UTF-8">/i, `$&\n    <link rel="canonical" href="${canonical}">`);
  }

  const ogTags = `
    <meta property="og:title" content="${page.title}">
    <meta property="og:description" content="${page.description}">
    <meta property="og:image" content="${page.ogImage}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="pt_BR">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${page.title}">
    <meta name="twitter:description" content="${page.description}">
    <meta name="twitter:image" content="${page.ogImage}">`;

  if (/<meta property="og:title"/i.test(out)) {
    out = out.replace(/<meta property="og:title"[\s\S]*?<meta name="twitter:card"[^>]*>/i, ogTags.trim());
  } else {
    out = out.replace(/<\/head>/i, `    ${ogTags.trim()}\n</head>`);
  }

  if (page.out === 'index.html') {
    out = out.replace(
      /"image":\s*\["[^"]+"\]/,
      `"image": ["${page.ogImage}"]`
    );
    out = out.replace(
      /https:\/\/summit\.personaltraineracademy\.com\.br/g,
      CANONICAL_BASE
    );
  }

  const preconnects = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="preconnect" href="https://unpkg.com" crossorigin>
    <link rel="preconnect" href="https://www.youtube.com" crossorigin>
    <link rel="preconnect" href="https://www.google.com" crossorigin>
    <link rel="dns-prefetch" href="https://hook.us1.make.com">`;

  out = out.replace(/<link rel="preconnect"[^>]*>\s*/gi, '');
  out = out.replace(/<link rel="dns-prefetch"[^>]*>\s*/gi, '');
  out = out.replace(/<\/head>/i, `    ${preconnects.trim()}\n</head>`);

  return out;
}

function injectProductionAssets(html, page) {
  const cssLinks = `
    <link rel="stylesheet" href="css/tailwind.css">
    <link rel="stylesheet" href="css/${page.cssOut}">`;

  const thirdPartyHead = `
    <link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800&family=Oswald:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdn.rawgit.com/mfd/09b70eb47474836f25a21660282ce0fd/raw/e06a670afcb2b861ed2ac4a1ef752d062ef6b46b/Gilroy.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">`;

  let out = removeTailwindCdn(html);
  out = removeInlineStyle(out);
  out = removeInlineAppScripts(out);

  out = out.replace(/<link href="https:\/\/unpkg\.com\/aos[^>]*>\s*/i, '');
  out = out.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/gi, '');
  out = out.replace(/<link[^>]*Gilroy\.css[^>]*>\s*/i, '');
  out = out.replace(/<link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome[^>]*>\s*/i, '');

  out = out.replace('</head>', `${cssLinks}\n${thirdPartyHead}\n</head>`);

  const scripts = `
    <script src="https://www.youtube.com/iframe_api" defer></script>
    <script src="https://unpkg.com/aos@2.3.1/dist/aos.js" defer></script>
    <script src="js/${page.jsOut}" defer></script>`;

  const bodyScripts = page.out === 'index.html'
    ? scripts
    : `
    <script src="https://unpkg.com/aos@2.3.1/dist/aos.js" defer></script>
    <script src="js/${page.jsOut}" defer></script>`;

  out = out.replace(/<script src="https:\/\/www\.youtube\.com\/iframe_api"><\/script>\s*/i, '');
  out = out.replace(/<script src="https:\/\/unpkg\.com\/aos[^>]*><\/script>\s*/i, '');

  out = out.replace('</body>', `${bodyScripts}\n</body>`);

  out = out.replace(/bg-\[url\('assets\/hero-bg\.png'\)\]/g, "bg-[url('assets/hero-bg.webp')]");

  return out;
}

async function processPage(page) {
  const srcPath = path.join(ROOT, page.src);
  let html = fs.readFileSync(srcPath, 'utf8');

  const customCss = extractStyle(html);
  const customJs = extractInlineScripts(html);

  ensureDir(path.join(DIST, 'css'));
  ensureDir(path.join(DIST, 'js'));

  if (customCss) {
    const minCss = minifyCss(customCss, page.cssOut);
    fs.writeFileSync(path.join(DIST, 'css', page.cssOut), minCss);
    log(`CSS → dist/css/${page.cssOut}`);
  }

  if (customJs) {
    const minJs = await minifyJsCode(customJs, page.jsOut);
    fs.writeFileSync(path.join(DIST, 'js', page.jsOut), minJs);
    log(`JS → dist/js/${page.jsOut}`);
  }

  html = applySeoHead(html, page);
  html = injectProductionAssets(html, page);

  const minified = await minifyHtml(html, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    minifyCSS: false,
    minifyJS: false,
    keepClosingSlash: true,
    caseSensitive: true,
    ignoreCustomFragments: [/\{\{[\s\S]*?\}\}/],
  });

  fs.writeFileSync(path.join(DIST, page.out), minified);
  log(`HTML → dist/${page.out}`);
}

async function main() {
  log('Limpando dist/...');
  rimraf(DIST);
  ensureDir(DIST);
  ensureDir(path.join(DIST, 'css'));
  ensureDir(path.join(DIST, 'js'));

  log('Copiando e otimizando assets...');
  await optimizeAssets();

  log('Gerando Tailwind purgado...');
  buildTailwind();

  for (const page of HTML_PAGES) {
    await processPage(page);
  }

  log('Build concluído em dist/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
