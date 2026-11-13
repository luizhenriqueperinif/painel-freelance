// O armazém guarda e devolve os registros do painel. Não tem regra nenhuma: quem decide
// o que vale é o Painel (painel.ts). Trocar o armazém troca só o lugar onde os dados moram
// (o SQLite do PC ou um arquivo num repositório privado do GitHub). Ver docs/adr/0002.

import type { Frente, Oportunidade } from './tipos.ts';

/** Uma Tarefa como fica guardada, antes de o Painel juntar os dados da Oportunidade. */
export interface RegistroDeTarefa {
  id: number;
  titulo: string;
  dia: string | null;
  hora: string | null;
  oportunidadeId: number | null;
  repositorio: string | null;
  /** Frente da própria Tarefa. A frente que aparece na tela vem antes da Oportunidade. */
  frente: Frente | null;
  naAgenda: boolean;
  feitaEm: string | null;
  criadaEm: string;
}

export interface Armazem {
  listarOportunidades(): Promise<Oportunidade[]>;
  buscarOportunidade(id: number): Promise<Oportunidade | null>;
  inserirOportunidade(dados: Omit<Oportunidade, 'id'>): Promise<Oportunidade>;
  gravarOportunidade(oportunidade: Oportunidade): Promise<void>;

  listarTarefas(quais: 'abertas' | 'feitas' | 'todas'): Promise<RegistroDeTarefa[]>;
  buscarTarefa(id: number): Promise<RegistroDeTarefa | null>;
  inserirTarefa(dados: Omit<RegistroDeTarefa, 'id'>): Promise<RegistroDeTarefa>;
  gravarTarefa(tarefa: RegistroDeTarefa): Promise<void>;
  apagarTarefa(id: number): Promise<void>;

  frentesDosRepositorios(): Promise<Map<string, Frente | null>>;
  gravarFrenteDoRepositorio(nome: string, frente: Frente | null): Promise<void>;

  lerPreferencia(chave: string): Promise<string | null>;
  gravarPreferencia(chave: string, valor: string): Promise<void>;
}
