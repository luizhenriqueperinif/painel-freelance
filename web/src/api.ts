// As telas pedem tudo por aqui. No PC, os pedidos vão para o servidor local (/api).
// No app de Android não há servidor: as mesmas ações rodam no próprio celular (celular.ts).

import type {
  Frente,
  Hoje,
  LeituraRepositorios,
  MudancaOportunidade,
  MudancaTarefa,
  NovaOportunidade,
  NovaTarefa,
  OportunidadeComPasso,
  Tarefa,
  Tema,
} from '../../src/dominio/tipos.ts';
import { CABECALHO_SEM_CONEXAO } from '../../src/dominio/tipos.ts';
import type { Painel } from '../../src/dominio/painel.ts';
import { noCelular, painelDoCelular } from './celular.ts';
import { anotarConexao, SEM_COPIA } from './conexao.ts';

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(caminho, {
    ...opcoes,
    headers: opcoes.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  // Sem conexão com o GitHub, o servidor diz de quando é a leitura que está mostrando.
  anotarConexao(resposta.headers.get(CABECALHO_SEM_CONEXAO));
  if (resposta.status === 204) return undefined as T;
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error((corpo as { erro?: string }).erro ?? `Erro ${resposta.status}`);
  return corpo as T;
}

/** No celular: roda a ação no Painel daqui e, ganhando ou perdendo, conta como está a conexão. */
async function noAparelho<T>(acao: (painel: Painel) => Promise<T>): Promise<T> {
  const painel = await painelDoCelular();
  try {
    return await acao(painel);
  } finally {
    const { semConexao, dadosDe } = painel.estadoDosDados();
    anotarConexao(semConexao ? (dadosDe ?? SEM_COPIA) : null);
  }
}

const json = (corpo: unknown) => JSON.stringify(corpo);

const doServidor = {
  hoje: () => pedir<Hoje & { linkDoResumoDiario: string }>('/api/hoje'),
  oportunidades: (perdidas = false) => pedir<OportunidadeComPasso[]>(`/api/oportunidades${perdidas ? '?perdidas=1' : ''}`),
  criarOportunidade: (dados: NovaOportunidade) => pedir<OportunidadeComPasso>('/api/oportunidades', { method: 'POST', body: json(dados) }),
  atualizarOportunidade: (id: number, mudanca: MudancaOportunidade) =>
    pedir<OportunidadeComPasso>(`/api/oportunidades/${id}`, { method: 'PATCH', body: json(mudanca) }),
  tarefas: (estado: 'abertas' | 'feitas', frente?: Frente | 'sem-frente') =>
    pedir<Tarefa[]>(`/api/tarefas?estado=${estado}${frente ? `&frente=${encodeURIComponent(frente)}` : ''}`),
  criarTarefa: (dados: NovaTarefa) => pedir<Tarefa>('/api/tarefas', { method: 'POST', body: json(dados) }),
  atualizarTarefa: (id: number, mudanca: MudancaTarefa) => pedir<Tarefa>(`/api/tarefas/${id}`, { method: 'PATCH', body: json(mudanca) }),
  apagarTarefa: (id: number) => pedir<void>(`/api/tarefas/${id}`, { method: 'DELETE' }),
  repositorios: () => pedir<LeituraRepositorios>('/api/repositorios'),
  definirFrenteDoRepositorio: (nome: string, frente: Frente | null) =>
    pedir(`/api/repositorios/${encodeURIComponent(nome)}/frente`, { method: 'PUT', body: json({ frente }) }),
  tema: () => pedir<{ tema: Tema }>('/api/tema'),
  definirTema: (tema: Tema) => pedir<{ tema: Tema }>('/api/tema', { method: 'PUT', body: json({ tema }) }),
};

const doCelular: typeof doServidor = {
  hoje: () => noAparelho(async (p) => ({ ...(await p.hoje()), linkDoResumoDiario: p.linkDoResumoDiario() })),
  oportunidades: (perdidas = false) => noAparelho((p) => p.listarOportunidades({ incluirPerdidas: perdidas })),
  criarOportunidade: (dados) => noAparelho((p) => p.criarOportunidade(dados)),
  atualizarOportunidade: (id, mudanca) => noAparelho((p) => p.atualizarOportunidade(id, mudanca)),
  tarefas: (estado, frente) => noAparelho((p) => p.listarTarefas({ estado, frente })),
  criarTarefa: (dados) => noAparelho((p) => p.criarTarefa(dados)),
  atualizarTarefa: (id, mudanca) => noAparelho((p) => p.atualizarTarefa(id, mudanca)),
  apagarTarefa: (id) => noAparelho((p) => p.apagarTarefa(id)),
  // As pastas de código só existem no PC.
  repositorios: () => Promise.reject(new Error('A tela Repositórios só funciona no PC.')),
  definirFrenteDoRepositorio: (nome, frente) => noAparelho((p) => p.definirFrenteDoRepositorio(nome, frente)),
  tema: () => noAparelho(async (p) => ({ tema: await p.tema() })),
  definirTema: (tema) => noAparelho(async (p) => ({ tema: await p.definirTema(tema) })),
};

export const api = noCelular ? doCelular : doServidor;
