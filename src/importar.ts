// Importação única dos dados iniciais (por exemplo, do "Quadro do Freelance").
// Uso: npm run importar -- caminho/do/arquivo.json
// Formato: veja importacao.exemplo.json. O arquivo real fica em dados/, fora do git.
// Grava sempre no SQLite do PC. Para levar o SQLite para o repositório de dados: npm run copiar-para-o-github.

import { readFileSync } from 'node:fs';
import { ArmazemSqlite } from './dominio/armazem-sqlite.ts';
import { abrirBanco } from './dominio/banco.ts';
import { Painel } from './dominio/painel.ts';
import type { NovaOportunidade, NovaTarefa } from './dominio/tipos.ts';

interface ArquivoDeImportacao {
  oportunidades: (NovaOportunidade & { tarefas?: (Omit<NovaTarefa, 'oportunidadeId'> & { naAgenda?: boolean })[] })[];
  tarefas?: (NovaTarefa & { naAgenda?: boolean })[];
}

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Informe o arquivo: npm run importar -- dados/importacao.json');
  process.exit(1);
}

const dados = JSON.parse(readFileSync(arquivo, 'utf8')) as ArquivoDeImportacao;
const banco = abrirBanco();
const { total } = banco.prepare('SELECT COUNT(*) AS total FROM oportunidades').get() as { total: number };
if (total > 0 && !process.argv.includes('--forcar')) {
  console.error(`O banco já tem ${total} oportunidades. A importação é para rodar uma vez só (use --forcar se tiver certeza).`);
  process.exit(1);
}

const painel = new Painel(new ArmazemSqlite(banco));
let oportunidades = 0;
let tarefas = 0;

banco.exec('BEGIN');
try {
  const criarTarefa = async (t: NovaTarefa & { naAgenda?: boolean }) => {
    const { naAgenda, ...nova } = t;
    const criada = await painel.criarTarefa(nova);
    if (naAgenda) await painel.atualizarTarefa(criada.id, { naAgenda: true });
    tarefas++;
  };
  for (const { tarefas: daOportunidade = [], ...oportunidade } of dados.oportunidades) {
    const criada = await painel.criarOportunidade(oportunidade);
    oportunidades++;
    for (const t of daOportunidade) await criarTarefa({ ...t, oportunidadeId: criada.id });
  }
  for (const t of dados.tarefas ?? []) await criarTarefa(t);
  banco.exec('COMMIT');
} catch (erro) {
  banco.exec('ROLLBACK');
  throw erro;
}

console.log(`Importadas ${oportunidades} oportunidades e ${tarefas} tarefas.`);
