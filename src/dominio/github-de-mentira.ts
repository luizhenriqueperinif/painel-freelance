// Uma imitação da API de conteúdo do GitHub, para os testes rodarem sem rede.
// Responde como a API de verdade respondeu quando foi sondada em 13/11/2026:
// 404 para arquivo que não existe, 201 ao criar, 422 ao criar o que já existe,
// 409 quando o sha não é o atual e 304 quando a etiqueta ainda vale.

import { createHash } from 'node:crypto';

interface Pedido {
  metodo: string;
  caminho: string;
  cabecalhos: Record<string, string>;
  cache: string | undefined;
}

export interface GithubDeMentira {
  buscar: typeof fetch;
  /** O texto do arquivo num ramo ("main" se não disser), ou null. */
  texto(ramo?: string): string | null;
  /** Grava por fora, como se fosse outro aparelho. */
  gravarPorFora(texto: string, ramo?: string): void;
  pedidos: Pedido[];
  commits: string[];
  foraDoAr: boolean;
  /** Responde a tudo com este erro do lado do GitHub (502, 503...). */
  comProblema: number | null;
  /** Responde a tudo com a pausa por excesso de pedidos. */
  pedindoPausa: boolean;
  /** Chamado logo antes de cada gravação chegar: serve para encaixar a gravação de outro aparelho. */
  antesDeGravar: (() => void) | null;
  /** Acima deste tamanho o conteúdo não vem junto, como acontece no GitHub com mais de 1 MB. */
  limiteDoConteudo: number;
}

const sha = (texto: string) => createHash('sha1').update(`blob ${Buffer.byteLength(texto)}\0${texto}`).digest('hex');
const emLinhas = (base64: string) => base64.replace(/(.{60})/g, '$1\n');

export function githubDeMentira(repositorio: string, token: string): GithubDeMentira {
  const arquivos = new Map<string, string>();
  const chave = (ramo: string | null | undefined, caminho: string) => `${ramo ?? 'main'}:${caminho}`;

  const responder = (status: number, corpo?: unknown, cabecalhos: Record<string, string> = {}) =>
    new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...cabecalhos } });

  const github: GithubDeMentira = {
    pedidos: [],
    commits: [],
    foraDoAr: false,
    comProblema: null,
    pedindoPausa: false,
    antesDeGravar: null,
    limiteDoConteudo: 1024 * 1024,
    texto: (ramo) => arquivos.get(chave(ramo, 'painel.json')) ?? null,
    gravarPorFora: (texto, ramo) => {
      arquivos.set(chave(ramo, 'painel.json'), texto);
      github.commits.push('gravado por fora');
    },
    buscar: (async (entrada: string | URL | Request, opcoes: RequestInit = {}) => {
      if (github.foraDoAr) throw new TypeError('fetch failed');
      const url = new URL(String(entrada));
      const metodo = opcoes.method ?? 'GET';
      const cabecalhos = Object.fromEntries(Object.entries((opcoes.headers ?? {}) as Record<string, string>).map(([nome, valor]) => [nome.toLowerCase(), valor]));
      github.pedidos.push({ metodo, caminho: `${url.pathname}${url.search}`, cabecalhos, cache: opcoes.cache });

      if (github.comProblema !== null) return responder(github.comProblema, { message: 'Server Error' });
      if (github.pedindoPausa) return responder(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' });
      if (cabecalhos.authorization !== `Bearer ${token}`) return responder(401, { message: 'Bad credentials' });
      const base = `/repos/${repositorio}`;
      if (!url.pathname.startsWith(base)) return responder(404, { message: 'Not Found' });
      const resto = url.pathname.slice(base.length);
      if (resto === '') return responder(200, { full_name: repositorio, private: true });

      if (resto.startsWith('/git/blobs/')) {
        const texto = [...arquivos.values()].find((t) => sha(t) === resto.slice('/git/blobs/'.length));
        return texto === undefined ? responder(404, { message: 'Not Found' }) : responder(200, { encoding: 'base64', content: emLinhas(Buffer.from(texto).toString('base64')) });
      }

      if (!resto.startsWith('/contents/')) return responder(404, { message: 'Not Found' });
      const caminho = decodeURIComponent(resto.slice('/contents/'.length));

      if (metodo === 'GET') {
        const texto = arquivos.get(chave(url.searchParams.get('ref'), caminho));
        if (texto === undefined) return responder(404, { message: 'Not Found' });
        const etiqueta = `W/"${sha(texto)}"`;
        if (cabecalhos['if-none-match'] === etiqueta) return new Response(null, { status: 304, headers: { etag: etiqueta } });
        const tamanho = Buffer.byteLength(texto);
        return responder(
          200,
          { type: 'file', sha: sha(texto), size: tamanho, encoding: 'base64', content: tamanho > github.limiteDoConteudo ? '' : emLinhas(Buffer.from(texto).toString('base64')) },
          { etag: etiqueta, 'cache-control': 'private, max-age=60, s-maxage=60' },
        );
      }

      if (metodo === 'PUT') {
        github.antesDeGravar?.();
        const corpo = JSON.parse(String(opcoes.body)) as { message: string; content: string; sha?: string; branch?: string };
        const onde = chave(corpo.branch, caminho);
        const atual = arquivos.get(onde);
        if (atual !== undefined && corpo.sha === undefined) return responder(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
        if (corpo.sha !== undefined && (atual === undefined || corpo.sha !== sha(atual))) {
          return responder(409, { message: `${caminho} does not match ${corpo.sha}` });
        }
        const texto = Buffer.from(corpo.content, 'base64').toString('utf8');
        arquivos.set(onde, texto);
        github.commits.push(corpo.message);
        return responder(atual === undefined ? 201 : 200, { content: { sha: sha(texto) } });
      }

      return responder(405, { message: 'Method Not Allowed' });
    }) as typeof fetch,
  };
  return github;
}
