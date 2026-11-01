import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');
const safe = js => js.replace(/<\/script/gi, '<\\/script');

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${read('css/style.css')}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n${safe(read(src))}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'jnu-disaster-sim.html');
writeFileSync(out, html);
console.log(`단일 파일 생성: ${out} (${Math.round(html.length / 1024)}KB)`);
