import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehMaisNova, lerRelease } from './atualizacao.ts';

test('versão nova do app: compara número por número', () => {
  assert.equal(ehMaisNova('v0.1.1', '0.1.0'), true);
  assert.equal(ehMaisNova('0.2.0', '0.1.9'), true);
  assert.equal(ehMaisNova('0.10.0', '0.9.0'), true);
  assert.equal(ehMaisNova('v0.1.0', '0.1.0'), false);
  assert.equal(ehMaisNova('0.0.9', '0.1.0'), false);
});

test('release do GitHub: versão sem o v e o pacote das telas, quando houver', () => {
  const comTelas = {
    tag_name: 'v0.1.2',
    assets: [
      { name: 'painel-freelance.apk', browser_download_url: 'https://github.com/x/releases/download/v0.1.2/painel-freelance.apk' },
      { name: 'telas.zip', browser_download_url: 'https://github.com/x/releases/download/v0.1.2/telas.zip' },
    ],
  };
  assert.deepEqual(lerRelease(comTelas), { versao: '0.1.2', telas: 'https://github.com/x/releases/download/v0.1.2/telas.zip' });
  assert.deepEqual(lerRelease({ tag_name: 'v0.1.0', assets: [] }), { versao: '0.1.0', telas: null });
  assert.equal(lerRelease({ message: 'Not Found' }), null);
  assert.equal(lerRelease(null), null);
});
