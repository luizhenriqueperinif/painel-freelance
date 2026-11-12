// Vocabulário do painel. Os termos seguem o GLOSSARY.md.

export const FRENTES = ['Plataformas', 'Comércios', 'ONGs', 'Jogos'] as const;
export type Frente = (typeof FRENTES)[number];

export const SITUACOES = [
  'Ideia',
  'Demonstração pronta',
  'Proposta enviada',
  'Conversando',
  'Fechada',
  'Entregue',
  'Avaliada',
  'Perdida',
] as const;
export type Situacao = (typeof SITUACOES)[number];

/** Situações em que uma Oportunidade não precisa de próximo passo. */
export const SITUACOES_ENCERRADAS: readonly Situacao[] = ['Fechada', 'Entregue', 'Avaliada', 'Perdida'];

export const TEMAS = ['coral', 'azul', 'esmeralda', 'ciano', 'azul-claro'] as const;
export type Tema = (typeof TEMAS)[number];

export interface Oportunidade {
  id: number;
  nome: string;
  frente: Frente;
  situacao: Situacao;
  /** Valor que o Luiz recebe, em centavos. Vazio para trabalho voluntário. */
  valorCentavos: number | null;
  prazo: string | null;
  link: string | null;
  contato: string | null;
  observacoes: string | null;
  criadaEm: string;
  atualizadaEm: string;
}

export interface OportunidadeComPasso extends Oportunidade {
  proximoPasso: Tarefa | null;
  parada: boolean;
}

export interface Tarefa {
  id: number;
  titulo: string;
  /** Dia no formato AAAA-MM-DD. */
  dia: string | null;
  /** Hora no formato HH:MM. Só existe junto com o dia. */
  hora: string | null;
  oportunidadeId: number | null;
  oportunidadeNome: string | null;
  repositorio: string | null;
  /** Frente efetiva: a da Oportunidade, senão a da própria Tarefa. */
  frente: Frente | null;
  naAgenda: boolean;
  feitaEm: string | null;
  criadaEm: string;
  /** Link do Google Agenda já preenchido, só para Tarefa com hora. */
  linkAgenda: string | null;
}

export interface NovaOportunidade {
  nome: string;
  frente: Frente;
  situacao?: Situacao;
  valorCentavos?: number | null;
  prazo?: string | null;
  link?: string | null;
  contato?: string | null;
  observacoes?: string | null;
}

export type MudancaOportunidade = Partial<NovaOportunidade>;

export interface NovaTarefa {
  titulo: string;
  dia?: string | null;
  hora?: string | null;
  oportunidadeId?: number | null;
  repositorio?: string | null;
  frente?: Frente | null;
}

export interface MudancaTarefa extends Partial<NovaTarefa> {
  feita?: boolean;
  naAgenda?: boolean;
}

export interface Hoje {
  dia: string;
  paraHoje: Tarefa[];
  atrasadas: Tarefa[];
  proximosDias: Tarefa[];
  semData: Tarefa[];
  paradas: OportunidadeComPasso[];
  frentes: { frente: Frente; oportunidades: number }[];
  oportunidadesAtivas: number;
  propostasEsperando: number;
  avaliacoes: number;
}

export interface Repositorio {
  nome: string;
  caminho: string;
  descricao: string | null;
  existe: boolean;
  temGit: boolean;
  tecnologias: string[];
  ultimoCommit: string | null;
  inativo: boolean;
  mudancasNaoSalvas: number;
  github: string | null;
  frente: Frente | null;
  /** Nomes de arquivos de segredo que o git está enviando. O conteúdo nunca é lido. */
  segredosNoGit: string[];
  erro: string | null;
}

export interface LeituraRepositorios {
  lidoEm: string;
  repositorios: Repositorio[];
}

export class ErroDeValidacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeValidacao';
  }
}

export class NaoEncontrado extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'NaoEncontrado';
  }
}
