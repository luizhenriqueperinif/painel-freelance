// A camada de ações do painel. O site e o servidor MCP só chamam o que está aqui;
// nenhuma regra fica duplicada fora deste arquivo (ver docs/adr/0001).

import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { linkDoCompromisso } from './agenda.ts';
import { diaDeHoje, ehDiaValido, ehHoraValida, somarDias } from './datas.ts';
import {
  ErroDeValidacao,
  FRENTES,
  NaoEncontrado,
  SITUACOES,
  SITUACOES_ENCERRADAS,
  TEMAS,
  type Frente,
  type Hoje,
  type MudancaOportunidade,
  type MudancaTarefa,
  type NovaOportunidade,
  type NovaTarefa,
  type Oportunidade,
  type OportunidadeComPasso,
  type Situacao,
  type Tarefa,
  type Tema,
} from './tipos.ts';

const DIAS_DE_PROXIMOS = 7;

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
  oportunidade_nome: string | null;
  oportunidade_frente: string | null;
  repositorio: string | null;
  frente: string | null;
  na_agenda: number;
  feita_em: string | null;
  criada_em: string;
}

const SELECT_TAREFA = `
  SELECT t.*, o.nome AS oportunidade_nome, o.frente AS oportunidade_frente
  FROM tarefas t LEFT JOIN oportunidades o ON o.id = t.oportunidade_id`;

// Tarefas sem dia vão para o fim; dentro do dia, as sem hora vêm depois das com hora.
const ORDEM_TAREFA = `ORDER BY t.dia IS NULL, t.dia, t.hora IS NULL, t.hora, t.id`;

function texto(valor: string | null | undefined): string | null {
  const limpo = valor?.trim();
  return limpo ? limpo : null;
}

function validarFrente(frente: unknown): Frente {
  if (!FRENTES.includes(frente as Frente)) {
    throw new ErroDeValidacao(`Frente inválida: "${String(frente)}". Use ${FRENTES.join(', ')}.`);
  }
  return frente as Frente;
}

function validarSituacao(situacao: unknown): Situacao {
  if (!SITUACOES.includes(situacao as Situacao)) {
    throw new ErroDeValidacao(`Situação inválida: "${String(situacao)}". Use ${SITUACOES.join(', ')}.`);
  }
  return situacao as Situacao;
}

function validarValor(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  if (!Number.isInteger(valor) || valor < 0) throw new ErroDeValidacao('O valor precisa ser um número inteiro de centavos, sem sinal.');
  return valor;
}

function validarDiaEHora(dia: string | null, hora: string | null): void {
  if (dia !== null && !ehDiaValido(dia)) throw new ErroDeValidacao(`Dia inválido: "${dia}". Use AAAA-MM-DD.`);
  if (hora !== null && !ehHoraValida(hora)) throw new ErroDeValidacao(`Hora inválida: "${hora}". Use HH:MM.`);
  if (hora !== null && dia === null) throw new ErroDeValidacao('Uma tarefa com hora precisa ter dia.');
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

function paraTarefa(l: LinhaTarefa): Tarefa {
  const frente = (l.oportunidade_frente ?? l.frente) as Frente | null;
  const linkAgenda =
    l.dia && l.hora
      ? linkDoCompromisso({
          titulo: l.titulo,
          dia: l.dia,
          hora: l.hora,
          detalhes: [l.oportunidade_nome, frente, 'Criado pelo Painel do Freelance'].filter(Boolean).join(' · '),
        })
      : null;
  return {
    id: l.id,
    titulo: l.titulo,
    dia: l.dia,
    hora: l.hora,
    oportunidadeId: l.oportunidade_id,
    oportunidadeNome: l.oportunidade_nome,
    repositorio: l.repositorio,
    frente,
    naAgenda: l.na_agenda === 1,
    feitaEm: l.feita_em,
    criadaEm: l.criada_em,
    linkAgenda,
  };
}

export class Painel {
  private readonly banco: DatabaseSync;
  private readonly relogio: () => Date;

  constructor(banco: DatabaseSync, relogio: () => Date = () => new Date()) {
    this.banco = banco;
    this.relogio = relogio;
  }

  private agoraIso(): string {
    return this.relogio().toISOString();
  }

  // ---------- Oportunidades ----------

  listarOportunidades(filtro: { frente?: Frente; incluirPerdidas?: boolean } = {}): OportunidadeComPasso[] {
    const condicoes: string[] = [];
    const parametros: SQLInputValue[] = [];
    if (filtro.frente) {
      condicoes.push('frente = ?');
      parametros.push(validarFrente(filtro.frente));
    }
    if (!filtro.incluirPerdidas) condicoes.push(`situacao <> 'Perdida'`);
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
    const linhas = this.banco
      .prepare(`SELECT * FROM oportunidades ${where} ORDER BY id`)
      .all(...parametros) as unknown as LinhaOportunidade[];
    const passos = this.proximosPassos();
    return linhas.map((l) => {
      const oportunidade = paraOportunidade(l);
      const proximoPasso = passos.get(oportunidade.id) ?? null;
      return {
        ...oportunidade,
        proximoPasso,
        parada: proximoPasso === null && !SITUACOES_ENCERRADAS.includes(oportunidade.situacao),
      };
    });
  }

  buscarOportunidade(id: number): OportunidadeComPasso {
    const linha = this.banco.prepare('SELECT * FROM oportunidades WHERE id = ?').get(id) as LinhaOportunidade | undefined;
    if (!linha) throw new NaoEncontrado(`Oportunidade ${id} não encontrada.`);
    const oportunidade = paraOportunidade(linha);
    const proximoPasso = this.proximosPassos().get(id) ?? null;
    return {
      ...oportunidade,
      proximoPasso,
      parada: proximoPasso === null && !SITUACOES_ENCERRADAS.includes(oportunidade.situacao),
    };
  }

  criarOportunidade(dados: NovaOportunidade): OportunidadeComPasso {
    const nome = texto(dados.nome);
    if (!nome) throw new ErroDeValidacao('A oportunidade precisa de um nome.');
    const agora = this.agoraIso();
    const resultado = this.banco
      .prepare(
        `INSERT INTO oportunidades (nome, frente, situacao, valor_centavos, prazo, link, contato, observacoes, criada_em, atualizada_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nome,
        validarFrente(dados.frente),
        validarSituacao(dados.situacao ?? 'Ideia'),
        validarValor(dados.valorCentavos),
        texto(dados.prazo),
        texto(dados.link),
        texto(dados.contato),
        texto(dados.observacoes),
        agora,
        agora,
      );
    return this.buscarOportunidade(Number(resultado.lastInsertRowid));
  }

  atualizarOportunidade(id: number, mudanca: MudancaOportunidade): OportunidadeComPasso {
    const atual = this.buscarOportunidade(id);
    const nome = mudanca.nome === undefined ? atual.nome : texto(mudanca.nome);
    if (!nome) throw new ErroDeValidacao('A oportunidade precisa de um nome.');
    const escolher = <T,>(novo: T | undefined, velho: T) => (novo === undefined ? velho : novo);
    this.banco
      .prepare(
        `UPDATE oportunidades SET nome = ?, frente = ?, situacao = ?, valor_centavos = ?, prazo = ?, link = ?,
         contato = ?, observacoes = ?, atualizada_em = ? WHERE id = ?`,
      )
      .run(
        nome,
        validarFrente(escolher(mudanca.frente, atual.frente)),
        validarSituacao(escolher(mudanca.situacao, atual.situacao)),
        validarValor(escolher(mudanca.valorCentavos, atual.valorCentavos)),
        mudanca.prazo === undefined ? atual.prazo : texto(mudanca.prazo),
        mudanca.link === undefined ? atual.link : texto(mudanca.link),
        mudanca.contato === undefined ? atual.contato : texto(mudanca.contato),
        mudanca.observacoes === undefined ? atual.observacoes : texto(mudanca.observacoes),
        this.agoraIso(),
        id,
      );
    return this.buscarOportunidade(id);
  }

  /** O próximo passo de cada Oportunidade: a Tarefa aberta mais próxima. */
  private proximosPassos(): Map<number, Tarefa> {
    const linhas = this.banco
      .prepare(`${SELECT_TAREFA} WHERE t.feita_em IS NULL AND t.oportunidade_id IS NOT NULL ${ORDEM_TAREFA}`)
      .all() as unknown as LinhaTarefa[];
    const passos = new Map<number, Tarefa>();
    for (const linha of linhas) {
      if (!passos.has(linha.oportunidade_id!)) passos.set(linha.oportunidade_id!, paraTarefa(linha));
    }
    return passos;
  }

  // ---------- Tarefas ----------

  listarTarefas(filtro: { estado?: 'abertas' | 'feitas' | 'todas'; frente?: Frente | 'sem-frente'; oportunidadeId?: number } = {}): Tarefa[] {
    const estado = filtro.estado ?? 'abertas';
    const condicoes: string[] = [];
    const parametros: SQLInputValue[] = [];
    if (estado === 'abertas') condicoes.push('t.feita_em IS NULL');
    if (estado === 'feitas') condicoes.push('t.feita_em IS NOT NULL');
    if (filtro.oportunidadeId !== undefined) {
      condicoes.push('t.oportunidade_id = ?');
      parametros.push(filtro.oportunidadeId);
    }
    if (filtro.frente === 'sem-frente') condicoes.push('COALESCE(o.frente, t.frente) IS NULL');
    else if (filtro.frente) {
      condicoes.push('COALESCE(o.frente, t.frente) = ?');
      parametros.push(validarFrente(filtro.frente));
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
    const ordem = estado === 'feitas' ? 'ORDER BY t.feita_em DESC' : ORDEM_TAREFA;
    const linhas = this.banco.prepare(`${SELECT_TAREFA} ${where} ${ordem}`).all(...parametros) as unknown as LinhaTarefa[];
    return linhas.map(paraTarefa);
  }

  buscarTarefa(id: number): Tarefa {
    const linha = this.banco.prepare(`${SELECT_TAREFA} WHERE t.id = ?`).get(id) as LinhaTarefa | undefined;
    if (!linha) throw new NaoEncontrado(`Tarefa ${id} não encontrada.`);
    return paraTarefa(linha);
  }

  criarTarefa(dados: NovaTarefa): Tarefa {
    const titulo = texto(dados.titulo);
    if (!titulo) throw new ErroDeValidacao('A tarefa precisa de um título.');
    const dia = texto(dados.dia);
    const hora = texto(dados.hora);
    validarDiaEHora(dia, hora);
    const oportunidadeId = dados.oportunidadeId ?? null;
    if (oportunidadeId !== null) this.buscarOportunidade(oportunidadeId);
    const frente = dados.frente ? validarFrente(dados.frente) : null;
    const resultado = this.banco
      .prepare(
        `INSERT INTO tarefas (titulo, dia, hora, oportunidade_id, repositorio, frente, criada_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(titulo, dia, hora, oportunidadeId, texto(dados.repositorio), frente, this.agoraIso());
    return this.buscarTarefa(Number(resultado.lastInsertRowid));
  }

  atualizarTarefa(id: number, mudanca: MudancaTarefa): Tarefa {
    const atual = this.buscarTarefa(id);
    const linhaAtual = this.banco.prepare('SELECT frente FROM tarefas WHERE id = ?').get(id) as { frente: string | null };
    const titulo = mudanca.titulo === undefined ? atual.titulo : texto(mudanca.titulo);
    if (!titulo) throw new ErroDeValidacao('A tarefa precisa de um título.');
    const dia = mudanca.dia === undefined ? atual.dia : texto(mudanca.dia);
    // Tirar o dia também tira a hora.
    const hora = mudanca.hora === undefined ? (dia === null ? null : atual.hora) : texto(mudanca.hora);
    validarDiaEHora(dia, hora);
    const oportunidadeId = mudanca.oportunidadeId === undefined ? atual.oportunidadeId : mudanca.oportunidadeId;
    if (oportunidadeId !== null) this.buscarOportunidade(oportunidadeId);
    const frente = mudanca.frente === undefined ? linhaAtual.frente : mudanca.frente ? validarFrente(mudanca.frente) : null;
    const feitaEm = mudanca.feita === undefined ? atual.feitaEm : mudanca.feita ? (atual.feitaEm ?? this.agoraIso()) : null;
    // Mudar dia ou hora invalida o compromisso que já foi para o Google Agenda.
    const mudouHorario = dia !== atual.dia || hora !== atual.hora;
    const naAgenda = mudanca.naAgenda ?? (mudouHorario ? false : atual.naAgenda);
    this.banco
      .prepare(
        `UPDATE tarefas SET titulo = ?, dia = ?, hora = ?, oportunidade_id = ?, repositorio = ?, frente = ?,
         na_agenda = ?, feita_em = ? WHERE id = ?`,
      )
      .run(
        titulo,
        dia,
        hora,
        oportunidadeId,
        mudanca.repositorio === undefined ? atual.repositorio : texto(mudanca.repositorio),
        frente,
        naAgenda && hora !== null ? 1 : 0,
        feitaEm,
        id,
      );
    return this.buscarTarefa(id);
  }

  apagarTarefa(id: number): void {
    this.buscarTarefa(id);
    this.banco.prepare('DELETE FROM tarefas WHERE id = ?').run(id);
  }

  // ---------- Hoje ----------

  hoje(): Hoje {
    const dia = diaDeHoje(this.relogio());
    const limite = somarDias(dia, DIAS_DE_PROXIMOS);
    const abertas = this.listarTarefas({ estado: 'abertas' });
    const oportunidades = this.listarOportunidades({ incluirPerdidas: true });
    const ativas = oportunidades.filter((o) => o.situacao !== 'Perdida' && o.situacao !== 'Avaliada');
    return {
      dia,
      paraHoje: abertas.filter((t) => t.dia === dia),
      atrasadas: abertas.filter((t) => t.dia !== null && t.dia < dia),
      proximosDias: abertas.filter((t) => t.dia !== null && t.dia > dia && t.dia <= limite),
      semData: abertas.filter((t) => t.dia === null),
      paradas: oportunidades.filter((o) => o.parada),
      frentes: FRENTES.map((frente) => ({
        frente,
        oportunidades: oportunidades.filter((o) => o.frente === frente && o.situacao !== 'Perdida').length,
      })),
      oportunidadesAtivas: ativas.length,
      propostasEsperando: oportunidades.filter((o) => o.situacao === 'Proposta enviada').length,
      avaliacoes: oportunidades.filter((o) => o.situacao === 'Avaliada').length,
    };
  }

  // ---------- Repositórios e preferências ----------

  frentesDosRepositorios(): Map<string, Frente | null> {
    const linhas = this.banco.prepare('SELECT nome, frente FROM repositorio_frente').all() as { nome: string; frente: string | null }[];
    return new Map(linhas.map((l) => [l.nome, l.frente as Frente | null]));
  }

  definirFrenteDoRepositorio(nome: string, frente: Frente | null): void {
    const limpo = texto(nome);
    if (!limpo) throw new ErroDeValidacao('Informe o nome do repositório.');
    this.banco
      .prepare('INSERT INTO repositorio_frente (nome, frente) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET frente = excluded.frente')
      .run(limpo, frente === null ? null : validarFrente(frente));
  }

  tema(): Tema {
    const linha = this.banco.prepare(`SELECT valor FROM preferencias WHERE chave = 'tema'`).get() as { valor: string } | undefined;
    return TEMAS.includes(linha?.valor as Tema) ? (linha!.valor as Tema) : 'coral';
  }

  definirTema(tema: Tema): Tema {
    if (!TEMAS.includes(tema)) throw new ErroDeValidacao(`Tema inválido. Use ${TEMAS.join(', ')}.`);
    this.banco
      .prepare(`INSERT INTO preferencias (chave, valor) VALUES ('tema', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`)
      .run(tema);
    return tema;
  }

  /** Link do Compromisso diário das 8h que lembra de abrir o painel (o resumo da v1). */
  linkDoResumoDiario(): string {
    return linkDoCompromisso({
      titulo: 'Abrir o Painel do Freelance',
      dia: somarDias(diaDeHoje(this.relogio()), 1),
      hora: '08:00',
      detalhes: 'Ver a tela Hoje: tarefas do dia, atrasadas e oportunidades paradas.',
      repetirTodoDia: true,
    });
  }
}
