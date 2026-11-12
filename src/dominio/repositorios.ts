// Lê os Repositórios do PC sem alterar nada. Só consulta o git e os arquivos que dizem
// a tecnologia (package.json, pubspec.yaml...). Arquivos de segredo nunca são abertos:
// o painel só olha os NOMES que o git está versionando.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PASTA_DE_DADOS } from './banco.ts';
import { diasEntre } from './datas.ts';
import { FRENTES, type Frente, type LeituraRepositorios, type Repositorio } from './tipos.ts';

const executar = promisify(execFile);
const DIAS_PARA_INATIVO = 30;
export const ARQUIVO_DE_CONFIGURACAO = join(PASTA_DE_DADOS, 'repositorios.json');

export interface ConfiguracaoDeRepositorios {
  /** Pasta onde ficam os projetos. */
  raiz: string;
  repositorios: { pasta: string; nome?: string; descricao?: string; frente?: Frente | null }[];
}

export function lerConfiguracao(arquivo = ARQUIVO_DE_CONFIGURACAO): ConfiguracaoDeRepositorios {
  if (!existsSync(arquivo)) {
    throw new Error(`Falta o arquivo ${arquivo}. Copie repositorios.exemplo.json para dados/repositorios.json e ajuste as pastas.`);
  }
  const config = JSON.parse(readFileSync(arquivo, 'utf8')) as ConfiguracaoDeRepositorios;
  for (const r of config.repositorios) {
    if (r.frente && !FRENTES.includes(r.frente)) throw new Error(`Frente inválida em ${r.pasta}: ${r.frente}`);
  }
  return config;
}

// Nomes que costumam guardar senha ou chave. Exemplos (.env.example) não contam.
// O último padrão só vale para arquivos de dados (txt, json...), para não acusar código
// como "senha-form.tsx" ou "chaveamento.js".
const PADROES_DE_SEGREDO = [
  /(^|\/)\.env(\.(?!example$|exemplo$|sample$)[^/]+)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/i,
  /(^|\/)(credentials|service[-_]?account|client_secret)[^/]*\.json$/i,
  /(^|\/)config\.json$/i,
  /(^|[\/._-])(secrets?|senhas?|passwords?|chaves?|tokens?|credenciais)([._-][^/]*)?\.(txt|json|ya?ml|ini|cfg|csv)$/i,
];

export function ehArquivoDeSegredo(caminho: string): boolean {
  return PADROES_DE_SEGREDO.some((padrao) => padrao.test(caminho));
}

/** Converte o remote do git num link do GitHub para abrir no navegador. */
export function linkDoGithub(remote: string): string | null {
  const limpo = remote.trim();
  const ssh = /^git@github\.com:(.+?)(\.git)?$/.exec(limpo);
  if (ssh) return `https://github.com/${ssh[1]}`;
  const https = /^https:\/\/(?:[^@/]+@)?github\.com\/(.+?)(\.git)?\/?$/.exec(limpo);
  if (https) return `https://github.com/${https[1]}`;
  return null;
}

function lerJson(arquivo: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const PASTAS_IGNORADAS = /(^|\/)(node_modules|dist|build|\.git|vendor|\.venv|venv)\//;

/**
 * Descobre a tecnologia pelos arquivos do projeto. Com git, olha tudo o que está versionado;
 * sem git, só a raiz da pasta. Lê apenas arquivos de projeto (package.json, manifest.json).
 */
export function detectarTecnologias(pasta: string, versionados?: string[]): string[] {
  let arquivos: string[];
  if (versionados) arquivos = versionados.filter((a) => a && !PASTAS_IGNORADAS.test(a));
  else {
    try {
      arquivos = readdirSync(pasta);
    } catch {
      return [];
    }
  }
  const comNome = (nome: string) => arquivos.filter((a) => a === nome || a.endsWith(`/${nome}`));
  const quantos = (...extensoes: string[]) => arquivos.filter((a) => extensoes.some((e) => a.toLowerCase().endsWith(e))).length;
  const tecnologias = new Set<string>();

  const dependencias: Record<string, string> = {};
  for (const arquivo of comNome('package.json').slice(0, 6)) {
    const pacote = lerJson(join(pasta, arquivo));
    Object.assign(dependencias, pacote?.dependencies ?? {}, pacote?.devDependencies ?? {});
  }
  const usa = (nome: string) => nome in dependencias;
  if (usa('electron')) tecnologias.add('Electron');
  if (usa('expo')) tecnologias.add('Expo');
  else if (usa('react-native')) tecnologias.add('React Native');
  if (usa('next')) tecnologias.add('Next.js');
  else if (usa('react')) tecnologias.add('React');
  if (usa('vue')) tecnologias.add('Vue');
  if (usa('fastify')) tecnologias.add('Fastify');
  if (usa('express')) tecnologias.add('Express');

  if (comNome('pubspec.yaml').length > 0 || quantos('.dart') >= 3) tecnologias.add('Flutter');
  if (arquivos.some((a) => a.endsWith('ProjectSettings/ProjectVersion.txt'))) tecnologias.add('Unity');
  if (comNome('project.godot').length > 0) tecnologias.add('Godot');
  if (comNome('manifest.json').slice(0, 4).some((a) => lerJson(join(pasta, a))?.manifest_version)) tecnologias.add('Extensão do Chrome');
  if (quantos('.lua') >= 3) tecnologias.add('Lua');
  if (quantos('.cpp', '.hpp', '.cc') >= 3) tecnologias.add('C++');
  if (quantos('.cs') >= 3 && !tecnologias.has('Unity')) tecnologias.add('C#');
  if (quantos('.py') >= 1) tecnologias.add('Python');
  if (usa('@supabase/supabase-js') || arquivos.some((a) => /(^|\/)supabase(\/|$)/.test(a))) tecnologias.add('Supabase');
  if (usa('typescript') || comNome('tsconfig.json').length > 0) tecnologias.add('TypeScript');

  const temFramework = ['Electron', 'Expo', 'React Native', 'Next.js', 'React', 'Vue'].some((t) => tecnologias.has(t));
  if (!temFramework && quantos('.html') >= 1) tecnologias.add('HTML e CSS');
  if (!temFramework && !tecnologias.has('TypeScript') && quantos('.js', '.mjs') >= 1) tecnologias.add('JavaScript');
  if (tecnologias.size === 0 && quantos('.md') >= 1) tecnologias.add('Documentação');
  return [...tecnologias].slice(0, 4);
}

async function git(pasta: string, ...argumentos: string[]): Promise<string> {
  const { stdout } = await executar('git', ['-C', pasta, ...argumentos], { timeout: 15_000, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

async function lerUm(
  raiz: string,
  item: ConfiguracaoDeRepositorios['repositorios'][number],
  frente: Frente | null,
  agora: Date,
): Promise<Repositorio> {
  const caminho = join(raiz, item.pasta);
  const base: Repositorio = {
    nome: item.nome ?? item.pasta,
    caminho,
    descricao: item.descricao ?? null,
    existe: existsSync(caminho),
    temGit: false,
    tecnologias: [],
    ultimoCommit: null,
    inativo: false,
    mudancasNaoSalvas: 0,
    github: null,
    frente,
    segredosNoGit: [],
    erro: null,
  };
  if (!base.existe) return { ...base, erro: 'Pasta não encontrada.' };
  base.temGit = existsSync(join(caminho, '.git'));
  if (!base.temGit) return { ...base, tecnologias: detectarTecnologias(caminho) };
  try {
    const [ultimo, status, remotos, versionados] = await Promise.all([
      git(caminho, 'log', '-1', '--format=%cI').catch(() => ''),
      git(caminho, 'status', '--porcelain'),
      git(caminho, 'remote', '-v').catch(() => ''),
      git(caminho, 'ls-files'),
    ]);
    base.ultimoCommit = ultimo.trim() || null;
    base.inativo = base.ultimoCommit !== null && diasEntre(new Date(base.ultimoCommit), agora) > DIAS_PARA_INATIVO;
    base.mudancasNaoSalvas = status.split('\n').filter((l) => l.trim()).length;
    const origem = remotos.split('\n').find((l) => l.startsWith('origin')) ?? remotos.split('\n')[0] ?? '';
    base.github = linkDoGithub(origem.split(/\s+/)[1] ?? '');
    const arquivos = versionados.split('\n').filter(Boolean);
    base.tecnologias = detectarTecnologias(caminho, arquivos.length > 0 ? arquivos : undefined);
    base.segredosNoGit = arquivos.filter(ehArquivoDeSegredo);
  } catch (erro) {
    if (base.tecnologias.length === 0) base.tecnologias = detectarTecnologias(caminho);
    base.erro = `Não consegui ler o git: ${(erro as Error).message.split('\n')[0]}`;
  }
  return base;
}

export async function lerRepositorios(
  config: ConfiguracaoDeRepositorios,
  frentesEscolhidas: Map<string, Frente | null>,
  agora = new Date(),
): Promise<LeituraRepositorios> {
  const repositorios = await Promise.all(
    config.repositorios.map((item) => {
      const nome = item.nome ?? item.pasta;
      const frente = frentesEscolhidas.has(nome) ? frentesEscolhidas.get(nome)! : (item.frente ?? null);
      return lerUm(config.raiz, item, frente, agora);
    }),
  );
  return { lidoEm: agora.toISOString(), repositorios };
}
