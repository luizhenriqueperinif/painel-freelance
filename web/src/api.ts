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

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(caminho, {
    ...opcoes,
    headers: opcoes.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (resposta.status === 204) return undefined as T;
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error((corpo as { erro?: string }).erro ?? `Erro ${resposta.status}`);
  return corpo as T;
}

const json = (corpo: unknown) => JSON.stringify(corpo);

export const api = {
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
