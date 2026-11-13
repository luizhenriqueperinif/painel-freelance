import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehMaisNova } from './atualizacao.ts';

test('versão nova do app: compara número por número', () => {
  assert.equal(ehMaisNova('v0.1.1', '0.1.0'), true);
  assert.equal(ehMaisNova('0.2.0', '0.1.9'), true);
  assert.equal(ehMaisNova('0.10.0', '0.9.0'), true);
  assert.equal(ehMaisNova('v0.1.0', '0.1.0'), false);
  assert.equal(ehMaisNova('0.0.9', '0.1.0'), false);
});
