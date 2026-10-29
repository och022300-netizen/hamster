import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'vite';

// One self-contained static page: works under GitHub Pages project subpaths.
await build({ base: './' });
let html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const css = html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
const js = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!css || !js) throw new Error('빌드한 CSS와 JavaScript 파일을 찾을 수 없습니다.');
const readAsset = path => readFile(new URL(`../dist/${path.replace(/^\.\//, '')}`, import.meta.url), 'utf8');
const cssText = await readAsset(css[1]);
const jsText = await readAsset(js[1]);
// Escaping keeps arbitrary mission strings from ending an inline HTML element.
html = html.replace(css[0], () => `<style>${cssText.replace(/<\/style/gi, '<\\/style')}</style>`);
html = html.replace(js[0], () => `<script type="module">${jsText.replace(/<\/script/gi, '<\\/script')}</script>`);
const output = new URL('../docs/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('index.html', output), html);
await writeFile(new URL('.nojekyll', output), '');
console.log('docs/index.html: GitHub Pages용 독립 데모 생성 완료');
