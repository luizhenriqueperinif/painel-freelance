// Armazém no arquivo SQLite do PC (dados/painel.db). É onde os dados moram até a mudança
// para o repositório de dados no GitHub terminar (docs/adr/0002). Só roda no Node.

import type { DatabaseSync } from 'node:sqlite';
import type { Armazem, RegistroDeTarefa } from './armazem.ts';
import type { EstadoDosDados, Frente, Oportunidade, Situacao } from './tipos.ts';

interface LinhaOportunidade {
  id: number;
  nome: string;
  frente: string;
  situacao: string;
  valor_centavos: number | null;
  prazo: string | null;
  link: string | null;
  contato: string | null;
  observacoes: string | null;
  criada_em: string;
  atualizada_em: string;
}

interface LinhaTarefa {
  id: number;
  titulo: string;
  dia: string | null;
  hora: string | null;
  oportunidade_id: number | null;
  repositorio: string | null;
  frente: string | null;
  na_agenda: number;
  feita_em: string | null;
  criada_em: string;
}

function paraOportunidade(l: LinhaOportunidade): Oportunidade {
  return {
    id: l.id,
    nome: l.nome,
    frente: l.frente as Frente,
    situacao: l.situacao as Situacao,
    valorCentavos: l.valor_centavos,
    prazo: l.prazo,
    link: l.link,
    contato: l.contato,
    observacoes: l.observacoes,
    criadaEm: l.criada_em,
    atualizadaEm: l.atualizada_em,
  };
}

function paraTarefa(l: LinhaTarefa): RegistroDeTarefa {
  return {
    id: l.id,
    titulo: l.titulo,
    dia: l.dia,
    hora: l.hora,
    oportunidadeId: l.oportunidade_id,
    repositorio: l.repositorio,
    frente: l.frente as Frente | null,
    naAgenda: l.na_agenda === 1,
    feitaEm: l.feita_em,
    criadaEm: l.criada_em,
  };
}

export class ArmazemSqlite implements Armazem {
  private readonly banco: DatabaseSync;

  constructor(banco: DatabaseSync) {
    this.banco = banco;
  }

  async listarOportunidades(): Promise<Oportunidade[]> {
    const linhas = this.banco.prepare('SELECT * FROM oportunidades ORDER BY id').all() as unknown as LinhaOportunidade[];
    return linhas.map(paraOportunidade);
  }

  async buscarOportunidade(id: number): Promise<Oportunidade | null> {
    const linha = this.banco.prepare('SELECT * FROM oportunidades WHERE id = ?').get(id) as LinhaOportunidade | undefined;
    return linha ? paraOportunidade(linha) : null;
  }

  async inserirOportunidade(dados: Omit<Oportunidade, 'id'>): Promise<Oportunidade> {
    const resultado = this.banco
      .prepare(
        `INSERT INTO oportunidades (nome, frente, situacao, valor_centavos, prazo, link, contato, observacoes, criada_em, atualizada_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.nome,
        dados.frente,
        dados.situacao,
        dados.valorCentavos,
        dados.prazo,
        dados.link,
        dados.contato,
        dados.observacoes,
        dados.criadaEm,
        dados.atualizadaEm,
      );
    return { ...dados, id: Number(resultado.lastInsertRowid) };
  }

  async gravarOportunidade(o: Oportunidade): Promise<void> {
    this.banco
      .prepare(
        `UPDATE oportunidades SET nome = ?, frente = ?, situacao = ?, valor_centavos = ?, prazo = ?, link = ?,
         contato = ?, observacoes = ?, atualizada_em = ? WHERE id = ?`,
      )
      .run(o.nome, o.frente, o.situacao, o.valorCentavos, o.prazo, o.link, o.contato, o.observacoes, o.atualizadaEm, o.id);
  }

  async listarTarefas(quais: 'abertas' | 'feitas' | 'todas'): Promise<RegistroDeTarefa[]> {
    const where = quais === 'abertas' ? 'WHERE feita_em IS NULL' : quais === 'feitas' ? 'WHERE feita_em IS NOT NULL' : '';
    const linhas = this.banco.prepare(`SELECT * FROM tarefas ${where} ORDER BY id`).all() as unknown as LinhaTarefa[];
    return linhas.map(paraTarefa);
  }

  async buscarTarefa(id: number): Promise<RegistroDeTarefa | null> {
    const linha = this.banco.prepare('SELECT * FROM tarefas WHERE id = ?').get(id) as LinhaTarefa | undefined;
    return linha ? paraTarefa(linha) : null;
  }

  async inserirTarefa(dados: Omit<RegistroDeTarefa, 'id'>): Promise<RegistroDeTarefa> {
    const resultado = this.banco
      .prepare(
        `INSERT INTO tarefas (titulo, dia, hora, oportunidade_id, repositorio, frente, na_agenda, feita_em, criada_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.titulo,
        dados.dia,
        dados.hora,
        dados.oportunidadeId,
        dados.repositorio,
        dados.frente,
        dados.naAgenda ? 1 : 0,
        dados.feitaEm,
        dados.criadaEm,
      );
    return { ...dados, id: Number(resultado.lastInsertRowid) };
  }

  async gravarTarefa(t: RegistroDeTarefa): Promise<void> {
    this.banco
      .prepare(
        `UPDATE tarefas SET titulo = ?, dia = ?, hora = ?, oportunidade_id = ?, repositorio = ?, frente = ?,
         na_agenda = ?, feita_em = ? WHERE id = ?`,
      )
      .run(t.titulo, t.dia, t.hora, t.oportunidadeId, t.repositorio, t.frente, t.naAgenda ? 1 : 0, t.feitaEm, t.id);
  }

  async apagarTarefa(id: number): Promise<void> {
    this.banco.prepare('DELETE FROM tarefas WHERE id = ?').run(id);
  }

  async frentesDosRepositorios(): Promise<Map<string, Frente | null>> {
    const linhas = this.banco.prepare('SELECT nome, frente FROM repositorio_frente').all() as { nome: string; frente: string | null }[];
    return new Map(linhas.map((l) => [l.nome, l.frente as Frente | null]));
  }

  async gravarFrenteDoRepositorio(nome: string, frente: Frente | null): Promise<void> {
    this.banco
      .prepare('INSERT INTO repositorio_frente (nome, frente) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET frente = excluded.frente')
      .run(nome, frente);
  }

  async lerPreferencia(chave: string): Promise<string | null> {
    const linha = this.banco.prepare('SELECT valor FROM preferencias WHERE chave = ?').get(chave) as { valor: string } | undefined;
    return linha?.valor ?? null;
  }

  async gravarPreferencia(chave: string, valor: string): Promise<void> {
    this.banco
      .prepare('INSERT INTO preferencias (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
      .run(chave, valor);
  }

  /** O banco mora no próprio PC: o que ele devolve é sempre o de agora. */
  estado(): EstadoDosDados {
    return { semConexao: false, dadosDe: null };
  }
}
