import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copiaNoPc } from './abrir-armazem.ts';

async function pastaDeTeste(t: { after: (limpar: () => Promise<void>) => void }): Promise<string> {
  const pasta = await mkdtemp(join(tmpdir(), 'painel-copia-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  return pasta;
}

test('a cópia no PC guarda e devolve a última leitura, com acento', async (t) => {
  const pasta = await pastaDeTeste(t);
  // A pasta dados/ pode ainda não existir num PC novo.
  const arquivo = join(pasta, 'dados', 'copia-do-painel.json');
  const copia = copiaNoPc('fulano/dados', arquivo);
  assert.equal(await copia.ler(), null);
  const leitura = { texto: '{"nome": "Demonstração — ação"}\n', versao: 'abc123', lidaEm: 1_794_000_000_000 };
  await copia.gravar(leitura);
  assert.deepEqual(await copia.ler(), leitura);
  await copia.gravar({ ...leitura, versao: 'def456' });
  assert.equal((await copia.ler())?.versao, 'def456');
  assert.deepEqual(await readdir(join(pasta, 'dados')), ['copia-do-painel.json']);
});

test('a cópia de outro repositório não serve, nem um arquivo estragado', async (t) => {
  const pasta = await pastaDeTeste(t);
  const arquivo = join(pasta, 'copia-do-painel.json');
  await copiaNoPc('fulano/dados', arquivo).gravar({ texto: '{}', versao: '1', lidaEm: 1 });
  assert.equal(await copiaNoPc('fulano/outro', arquivo).ler(), null);
  await writeFile(arquivo, '{ pela metade', 'utf8');
  assert.equal(await copiaNoPc('fulano/dados', arquivo).ler(), null);
  await writeFile(arquivo, '{"repositorio": "fulano/dados", "texto": 5}', 'utf8');
  assert.equal(await copiaNoPc('fulano/dados', arquivo).ler(), null);
});
