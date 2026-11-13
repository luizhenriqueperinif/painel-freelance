// Copia tudo do SQLite do PC (dados/painel.db) para o repositório privado de dados no GitHub,
// com os mesmos números. É para rodar uma vez, na mudança (docs/adr/0002). Não altera o SQLite.
//
// Antes: dizer o repositório em dados/armazem.json (o modelo está em armazem.exemplo.json).
// Uso: npm run copiar-para-o-github
//      npm run copiar-para-o-github -- --forcar   (grava por cima do que já estiver no repositório)

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { arquivoNoGithub, lerEscolha } from './dominio/abrir-armazem.ts';
import { ArmazemEmArquivo, FORMATO, deTexto, paraTexto, type DadosDoPainel } from './dominio/armazem-arquivo.ts';
import { ArmazemSqlite } from './dominio/armazem-sqlite.ts';
import { abrirBanco, ARQUIVO_DO_BANCO } from './dominio/banco.ts';

function parar(mensagem: string): never {
  console.error(mensagem);
  process.exit(1);
}

if (!existsSync(ARQUIVO_DO_BANCO)) parar(`Não achei o banco do PC em ${ARQUIVO_DO_BANCO}.`);

const escolha = lerEscolha();
const doPc = new ArmazemSqlite(abrirBanco());
const oportunidades = await doPc.listarOportunidades();
const tarefas = await doPc.listarTarefas('todas');
const tema = await doPc.lerPreferencia('tema');

const dados: DadosDoPainel = {
  formato: FORMATO,
  // A numeração continua do maior número que já existe.
  proximaOportunidade: Math.max(0, ...oportunidades.map((o) => o.id)) + 1,
  proximaTarefa: Math.max(0, ...tarefas.map((t) => t.id)) + 1,
  oportunidades,
  tarefas,
  frentesDosRepositorios: Object.fromEntries(await doPc.frentesDosRepositorios()),
  preferencias: tema === null ? {} : { tema },
};

try {
  const arquivo = arquivoNoGithub(escolha);
  const jaTem = await arquivo.ler();
  if (jaTem && !process.argv.includes('--forcar')) {
    const la = deTexto(jaTem.texto);
    if (la.oportunidades.length + la.tarefas.length > 0) {
      parar(
        `O repositório ${escolha.repositorio} já tem ${la.oportunidades.length} oportunidades e ${la.tarefas.length} tarefas.\n` +
          'A cópia é para rodar uma vez só. Para gravar o SQLite por cima, rode de novo com --forcar.',
      );
    }
  }
  await arquivo.gravar(
    paraTexto(dados),
    jaTem?.versao ?? null,
    `Cópia do SQLite do PC: ${oportunidades.length} oportunidades e ${tarefas.length} tarefas`,
  );
} catch (erro) {
  parar(`A cópia não foi feita: ${(erro as Error).message}`);
}

console.log(`Copiadas ${oportunidades.length} oportunidades e ${tarefas.length} tarefas para ${escolha.repositorio}.`);

// Confere lendo de volta do GitHub, pelo mesmo caminho que o painel usa.
try {
  const doGithub = new ArmazemEmArquivo(arquivoNoGithub(escolha));
  assert.deepEqual(await doGithub.listarOportunidades(), oportunidades, 'oportunidades');
  assert.deepEqual(await doGithub.listarTarefas('todas'), tarefas, 'tarefas');
  assert.deepEqual([...(await doGithub.frentesDosRepositorios())].sort(), [...(await doPc.frentesDosRepositorios())].sort(), 'frentes dos repositórios');
  assert.equal(await doGithub.lerPreferencia('tema'), tema, 'tema');
} catch (erro) {
  parar(`A cópia terminou, mas o repositório não ficou igual ao SQLite. Não mude o painel para o GitHub ainda.\n${(erro as Error).message}`);
}

console.log('Conferido: o repositório tem exatamente os mesmos dados do SQLite.');
console.log(`O SQLite continua intacto. O painel só passa a usar o GitHub quando dados/armazem.json disser "dados": "github".`);
process.exit(0);
