// O arquivo de dados dentro de um repositório privado do GitHub (docs/adr/0002).
// Lê e grava pela API do GitHub, então roda no Node, no navegador e no celular.
// A versão do arquivo é o "sha" que o GitHub dá a cada conteúdo, e cada gravação vira um commit.

import { ConflitoDeVersao, type ArquivoDeDados } from './armazem-arquivo.ts';
import { ErroDeArmazenamento } from './tipos.ts';

export interface OpcoesDoGithub {
  /** O repositório privado de dados, no formato "dono/nome". */
  repositorio: string;
  /** Devolve o token de acesso. É chamado a cada pedido e o valor nunca é guardado aqui. */
  token: () => string | Promise<string>;
  /** Nome do arquivo dentro do repositório. */
  caminho?: string;
  /** Ramo onde gravar. Sem isso, vale o ramo principal do repositório. */
  ramo?: string;
  /** Para os testes trocarem a rede por uma imitação. */
  buscar?: typeof fetch;
}

const API = 'https://api.github.com';

function paraBase64(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

function deBase64(base64: string): string {
  const binario = atob(base64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binario, (letra) => letra.charCodeAt(0)));
}

export class ArquivoNoGithub implements ArquivoDeDados {
  private readonly repositorio: string;
  private readonly caminho: string;
  private readonly ramo: string | null;
  private readonly token: () => string | Promise<string>;
  private readonly buscar: typeof fetch;
  /** A última leitura, para perguntar ao GitHub "mudou desde esta etiqueta?" em vez de baixar tudo de novo. */
  private guardado: { etiqueta: string | null; texto: string; versao: string } | null = null;
  private repositorioConferido = false;

  constructor(opcoes: OpcoesDoGithub) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(opcoes.repositorio)) {
      throw new ErroDeArmazenamento(`O repositório de dados precisa estar no formato "dono/nome" (está "${opcoes.repositorio}").`);
    }
    this.repositorio = opcoes.repositorio;
    this.caminho = opcoes.caminho ?? 'painel.json';
    this.ramo = opcoes.ramo ?? null;
    this.token = opcoes.token;
    this.buscar = opcoes.buscar ?? ((...argumentos) => fetch(...argumentos));
  }

  private async pedir(metodo: string, caminho: string, corpo?: unknown, cabecalhos: Record<string, string> = {}): Promise<Response> {
    const token = await this.token();
    try {
      return await this.buscar(`${API}${caminho}`, {
        method: metodo,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...cabecalhos,
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        // O GitHub deixa o navegador guardar a resposta por 60 segundos; aqui a leitura precisa ser a de agora.
        cache: 'no-store',
      });
    } catch {
      throw new ErroDeArmazenamento('Não consegui falar com o GitHub. Confira a internet e tente de novo.');
    }
  }

  private recusa(resposta: Response): ErroDeArmazenamento {
    if (resposta.status === 401) return new ErroDeArmazenamento('O GitHub recusou o acesso: o token não vale mais ou foi revogado.');
    if (resposta.status === 403 || resposta.status === 429) {
      return resposta.headers.get('x-ratelimit-remaining') === '0' || resposta.status === 429 || resposta.headers.has('retry-after')
        ? new ErroDeArmazenamento('O GitHub pediu uma pausa por excesso de pedidos. Tente de novo em alguns minutos.')
        : new ErroDeArmazenamento(`Este acesso não tem permissão para gravar no repositório ${this.repositorio}.`);
    }
    if (resposta.status === 404) return this.semRepositorio();
    if (resposta.status >= 500) return new ErroDeArmazenamento(`O GitHub está com problema agora (erro ${resposta.status}). Tente de novo em instantes.`);
    return new ErroDeArmazenamento(`O GitHub recusou o pedido (erro ${resposta.status}).`);
  }

  private semRepositorio(): ErroDeArmazenamento {
    return new ErroDeArmazenamento(`Não achei o repositório ${this.repositorio} no GitHub, ou este acesso não enxerga ele.`);
  }

  private get caminhoDoArquivo(): string {
    return `/repos/${this.repositorio}/contents/${this.caminho.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** O GitHub responde 404 tanto para arquivo que não existe quanto para repositório errado. Aqui separa os dois. */
  private async conferirRepositorio(): Promise<void> {
    if (this.repositorioConferido) return;
    const resposta = await this.pedir('GET', `/repos/${this.repositorio}`);
    if (resposta.status === 404) throw this.semRepositorio();
    if (!resposta.ok) throw this.recusa(resposta);
    this.repositorioConferido = true;
  }

  async ler(): Promise<{ texto: string; versao: string } | null> {
    const ref = this.ramo ? `?ref=${encodeURIComponent(this.ramo)}` : '';
    const condicao: Record<string, string> = this.guardado?.etiqueta ? { 'If-None-Match': this.guardado.etiqueta } : {};
    const resposta = await this.pedir('GET', `${this.caminhoDoArquivo}${ref}`, undefined, condicao);

    if (resposta.status === 304 && this.guardado) return { texto: this.guardado.texto, versao: this.guardado.versao };
    if (resposta.status === 404) {
      await this.conferirRepositorio();
      this.guardado = null;
      return null;
    }
    if (!resposta.ok) throw this.recusa(resposta);

    const corpo = (await resposta.json()) as { type?: string; sha?: string; content?: string; size?: number };
    if (corpo.type !== 'file' || !corpo.sha) throw new ErroDeArmazenamento(`${this.caminho} no repositório ${this.repositorio} não é um arquivo.`);
    let base64 = corpo.content ?? '';
    if (!base64 && (corpo.size ?? 0) > 0) {
      // Acima de 1 MB o GitHub não manda o conteúdo junto: ele vem pelo endereço do "blob".
      const blob = await this.pedir('GET', `/repos/${this.repositorio}/git/blobs/${corpo.sha}`);
      if (!blob.ok) throw this.recusa(blob);
      base64 = ((await blob.json()) as { content: string }).content;
    }
    this.repositorioConferido = true;
    this.guardado = { etiqueta: resposta.headers.get('etag'), texto: deBase64(base64), versao: corpo.sha };
    return { texto: this.guardado.texto, versao: this.guardado.versao };
  }

  async gravar(texto: string, versaoAnterior: string | null, mensagem: string): Promise<string> {
    const resposta = await this.pedir('PUT', this.caminhoDoArquivo, {
      message: mensagem,
      content: paraBase64(texto),
      ...(versaoAnterior === null ? {} : { sha: versaoAnterior }),
      ...(this.ramo ? { branch: this.ramo } : {}),
    });
    // 409: o arquivo mudou depois da versão lida. 422 ao criar: alguém criou o arquivo antes.
    if (resposta.status === 409 || (resposta.status === 422 && versaoAnterior === null)) throw new ConflitoDeVersao();
    if (!resposta.ok) throw this.recusa(resposta);
    const corpo = (await resposta.json()) as { content: { sha: string } };
    // A etiqueta da leitura antiga não vale mais; a próxima leitura baixa o arquivo de novo.
    this.guardado = { etiqueta: null, texto, versao: corpo.content.sha };
    return corpo.content.sha;
  }
}
