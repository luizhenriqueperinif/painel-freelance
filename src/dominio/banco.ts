import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ_DO_PROJETO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PASTA_DE_DADOS = join(RAIZ_DO_PROJETO, 'dados');
export const ARQUIVO_DO_BANCO = join(PASTA_DE_DADOS, 'painel.db');

const MIGRACOES: string[] = [
  `
  CREATE TABLE oportunidades (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    frente TEXT NOT NULL,
    situacao TEXT NOT NULL,
    valor_centavos INTEGER,
    prazo TEXT,
    link TEXT,
    contato TEXT,
    observacoes TEXT,
    criada_em TEXT NOT NULL,
    atualizada_em TEXT NOT NULL
  );
  CREATE TABLE tarefas (
    id INTEGER PRIMARY KEY,
    titulo TEXT NOT NULL,
    dia TEXT,
    hora TEXT,
    oportunidade_id INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL,
    repositorio TEXT,
    frente TEXT,
    na_agenda INTEGER NOT NULL DEFAULT 0,
    feita_em TEXT,
    criada_em TEXT NOT NULL
  );
  CREATE INDEX tarefas_abertas ON tarefas (feita_em, dia, hora);
  CREATE TABLE repositorio_frente (
    nome TEXT PRIMARY KEY,
    frente TEXT
  );
  CREATE TABLE preferencias (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  `,
];

/** Abre o banco e aplica as migrações que faltam. Use ":memory:" nos testes. */
export function abrirBanco(arquivo: string = ARQUIVO_DO_BANCO): DatabaseSync {
  if (arquivo !== ':memory:') mkdirSync(dirname(arquivo), { recursive: true });
  const banco = new DatabaseSync(arquivo);
  banco.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  const { user_version: versao } = banco.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let i = versao; i < MIGRACOES.length; i++) {
    banco.exec('BEGIN');
    try {
      banco.exec(MIGRACOES[i]!);
      banco.exec(`PRAGMA user_version = ${i + 1}`);
      banco.exec('COMMIT');
    } catch (erro) {
      banco.exec('ROLLBACK');
      throw erro;
    }
  }
  return banco;
}
