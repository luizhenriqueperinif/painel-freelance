// Escolhe onde os dados moram para tudo o que roda no Node (servidor, MCP e os comandos).
// A escolha fica em dados/armazem.json, fora do git. Enquanto esse arquivo não disser
// "github", o painel continua no SQLite do PC, igual à primeira versão (docs/adr/0002).

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Armazem } from './armazem.ts';
import { ArmazemEmArquivo, type CopiaLocal } from './armazem-arquivo.ts';
import { ArmazemSqlite } from './armazem-sqlite.ts';
import { ArquivoNoGithub } from './arquivo-github.ts';
import { abrirBanco, PASTA_DE_DADOS } from './banco.ts';
import { ErroDeArmazenamento } from './tipos.ts';

export const ARQUIVO_DA_ESCOLHA = join(PASTA_DE_DADOS, 'armazem.json');
/** Opcional: um token só para o repositório de dados. Sem ele, vale o acesso que o git do PC já tem. */
export const ARQUIVO_DO_TOKEN = join(PASTA_DE_DADOS, 'token-github.txt');
/** A última leitura do repositório de dados, para o painel abrir sem conexão. */
export const ARQUIVO_DA_COPIA = join(PASTA_DE_DADOS, 'copia-do-painel.json');

export interface EscolhaDoArmazem {
  dados: 'sqlite' | 'github';
  /** O repositório privado de dados, no formato "dono/nome". */
  repositorio: string | null;
}

export function lerEscolha(arquivo = ARQUIVO_DA_ESCOLHA): EscolhaDoArmazem {
  if (!existsSync(arquivo)) return { dados: 'sqlite', repositorio: null };
  let lido: { dados?: unknown; repositorio?: unknown };
  try {
    lido = JSON.parse(readFileSync(arquivo, 'utf8')) as typeof lido;
  } catch {
    throw new Error(`${arquivo} não é um JSON válido. O modelo está em armazem.exemplo.json.`);
  }
  const dados = lido.dados ?? 'sqlite';
  if (dados !== 'sqlite' && dados !== 'github') throw new Error(`Em ${arquivo}, "dados" precisa ser "sqlite" ou "github" (está "${String(dados)}").`);
  const repositorio = typeof lido.repositorio === 'string' && lido.repositorio.trim() ? lido.repositorio.trim() : null;
  return { dados, repositorio };
}

/** Pede ao git do PC o acesso ao GitHub que ele já usa para o push. Nada é perguntado na tela. */
function tokenDoGit(): Promise<string> {
  return new Promise((resolve, reject) => {
    const semAcesso = () =>
      reject(
        new ErroDeArmazenamento(
          `O git deste PC não tem um acesso ao GitHub guardado. Faça um "git push" em qualquer repositório seu, ou coloque um token em ${ARQUIVO_DO_TOKEN}.`,
        ),
      );
    const git = spawn('git', ['credential', 'fill'], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let saida = '';
    git.stdout.on('data', (pedaco: Buffer) => (saida += pedaco.toString('utf8')));
    git.on('error', semAcesso);
    git.on('close', () => {
      const token = /^password=(.+)$/m.exec(saida)?.[1]?.trim();
      if (token) resolve(token);
      else semAcesso();
    });
    git.stdin.end('protocol=https\nhost=github.com\n\n');
  });
}

let tokenEmUso: Promise<string> | null = null;

/** O token do GitHub para este PC. Fica só na memória do processo. */
export function tokenDoGithub(): Promise<string> {
  tokenEmUso ??= (async () => {
    if (existsSync(ARQUIVO_DO_TOKEN)) {
      const doArquivo = readFileSync(ARQUIVO_DO_TOKEN, 'utf8').trim();
      if (doArquivo) return doArquivo;
    }
    return tokenDoGit();
  })();
  // Se falhou, a próxima chamada tenta de novo em vez de repetir o erro para sempre.
  tokenEmUso.catch(() => (tokenEmUso = null));
  return tokenEmUso;
}

/** O arquivo de dados no repositório privado escolhido em dados/armazem.json. */
export function arquivoNoGithub(escolha: EscolhaDoArmazem = lerEscolha()): ArquivoNoGithub {
  if (!escolha.repositorio) {
    throw new Error(`Falta dizer o repositório de dados em ${ARQUIVO_DA_ESCOLHA} (o modelo está em armazem.exemplo.json).`);
  }
  return new ArquivoNoGithub({ repositorio: escolha.repositorio, token: tokenDoGithub });
}

/**
 * A última leitura do repositório de dados, guardada em dados/ para o painel ter o que mostrar
 * sem conexão. A cópia leva o nome do repositório: trocar de repositório não mostra dados do antigo.
 */
export function copiaNoPc(repositorio: string, arquivo = ARQUIVO_DA_COPIA): CopiaLocal {
  return {
    async ler() {
      let lido: { repositorio?: unknown; texto?: unknown; versao?: unknown; lidaEm?: unknown };
      try {
        lido = JSON.parse(await readFile(arquivo, 'utf8')) as typeof lido;
      } catch {
        return null;
      }
      if (lido.repositorio !== repositorio || typeof lido.texto !== 'string' || typeof lido.versao !== 'string' || typeof lido.lidaEm !== 'number') return null;
      return { texto: lido.texto, versao: lido.versao, lidaEm: lido.lidaEm };
    },
    async gravar(copia) {
      // Grava ao lado e troca de uma vez: o servidor e o MCP usam a mesma cópia, e ninguém lê um arquivo pela metade.
      const provisorio = `${arquivo}.${process.pid}.tmp`;
      await mkdir(dirname(arquivo), { recursive: true });
      await writeFile(provisorio, JSON.stringify({ repositorio, ...copia }), 'utf8');
      await rename(provisorio, arquivo);
    },
  };
}

/** O armazém que o painel usa hoje: SQLite do PC ou o repositório no GitHub. */
export function abrirArmazem(escolha: EscolhaDoArmazem = lerEscolha()): Armazem {
  if (escolha.dados === 'sqlite') return new ArmazemSqlite(abrirBanco());
  return new ArmazemEmArquivo(arquivoNoGithub(escolha), undefined, copiaNoPc(escolha.repositorio!));
}
