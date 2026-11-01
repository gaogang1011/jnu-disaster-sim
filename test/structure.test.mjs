import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../src/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('src의 모든 파일이 index.html에 번호 순서대로 로드된다', () => {
  const loaded = [...html.matchAll(/<script src="src\/([^"]+)"><\/script>/g)].map(m => m[1]);
  assert.deepEqual(loaded, files);
});

test('최상위 이름이 파일 사이에서 겹치지 않는다', () => {
  const seen = new Map(), dup = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/^(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      const name = m[1];
      if (seen.has(name)) dup.push(`${name}: ${seen.get(name)} / ${f}`);
      else seen.set(name, f);
    }
  }
  assert.deepEqual(dup, []);
});
