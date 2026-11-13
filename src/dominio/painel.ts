// A camada de ações do painel. O site e o servidor MCP só chamam o que está aqui;
// nenhuma regra fica duplicada fora deste arquivo (ver docs/adr/0001).
// Este arquivo não usa nada do Node: roda igual no navegador e no celular (docs/adr/0002).
// Os dados chegam por um Armazém, e é aqui que eles são filtrados, ordenados e validados.

import { linkDoCompromisso } from './agenda.ts';
import type { Armazem, RegistroDeTarefa } from './armazem.ts';
import { diaDeHoje, ehDiaValido, ehHoraValida, somarDias } from './datas.ts';
import {
  ErroDeValidacao,
  FRENTES,
  NaoEncontrado,
  SITUACOES,
  SITUACOES_ENCERRADAS,
  TEMAS,
  type EstadoDosDados,
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

// Tarefas sem dia vão para o fim; dentro do dia, as sem hora vêm depois das com hora.
function ordemDeTarefa(a: Tarefa, b: Tarefa): number {
  if ((a.dia === null) !== (b.dia === null)) return a.dia === null ? 1 : -1;
  if (a.dia !== b.dia) return a.dia! < b.dia! ? -1 : 1;
  if ((a.hora === null) !== (b.hora === null)) return a.hora === null ? 1 : -1;
  if (a.hora !== b.hora) return a.hora! < b.hora! ? -1 : 1;
  return a.id - b.id;
}

/** Junta ao registro o que vem da Oportunidade: o nome, a frente e o link do Compromisso. */
function montarTarefa(registro: RegistroDeTarefa, oportunidade: Oportunidade | null): Tarefa {
  const frente = oportunidade?.frente ?? registro.frente;
  const linkAgenda =
    registro.dia && registro.hora
      ? linkDoCompromisso({
          titulo: registro.titulo,
          dia: registro.dia,
          hora: registro.hora,
          detalhes: [oportunidade?.nome, frente, 'Criado pelo Painel do Freelance'].filter(Boolean).join(' · '),
        })
      : null;
  return {
    id: registro.id,
    titulo: registro.titulo,
    dia: registro.dia,
    hora: registro.hora,
    oportunidadeId: registro.oportunidadeId,
    oportunidadeNome: oportunidade?.nome ?? null,
    repositorio: registro.repositorio,
    frente,
    naAgenda: registro.naAgenda,
    feitaEm: registro.feitaEm,
    criadaEm: registro.criadaEm,
    linkAgenda,
  };
}

function montarTarefas(registros: RegistroDeTarefa[], oportunidades: Oportunidade[]): Tarefa[] {
  const porId = new Map(oportunidades.map((o) => [o.id, o]));
  return registros.map((r) => montarTarefa(r, r.oportunidadeId === null ? null : (porId.get(r.oportunidadeId) ?? null)));
}

/** Junta a cada Oportunidade o seu próximo passo: a Tarefa aberta mais próxima. */
function comProximoPasso(oportunidades: Oportunidade[], abertas: Tarefa[]): OportunidadeComPasso[] {
  const passos = new Map<number, Tarefa>();
  for (const tarefa of [...abertas].sort(ordemDeTarefa)) {
    if (tarefa.oportunidadeId !== null && !passos.has(tarefa.oportunidadeId)) passos.set(tarefa.oportunidadeId, tarefa);
  }
  return [...oportunidades]
    .sort((a, b) => a.id - b.id)
    .map((oportunidade) => {
      const proximoPasso = passos.get(oportunidade.id) ?? null;
      return {
        ...oportunidade,
        proximoPasso,
        parada: proximoPasso === null && !SITUACOES_ENCERRADAS.includes(oportunidade.situacao),
      };
    });
}

export class Painel {
  private readonly armazem: Armazem;
  private readonly relogio: () => Date;

  constructor(armazem: Armazem, relogio: () => Date = () => new Date()) {
    this.armazem = armazem;
    this.relogio = relogio;
  }

  private agoraIso(): string {
    return this.relogio().toISOString();
  }

  /** As Oportunidades com o próximo passo e as Tarefas abertas, lidas de uma vez só. */
  private async carregar(): Promise<{ oportunidades: OportunidadeComPasso[]; abertas: Tarefa[] }> {
    const [oportunidades, registros] = await Promise.all([this.armazem.listarOportunidades(), this.armazem.listarTarefas('abertas')]);
    const abertas = montarTarefas(registros, oportunidades).sort(ordemDeTarefa);
    return { oportunidades: comProximoPasso(oportunidades, abertas), abertas };
  }

  private async oportunidadeGuardada(id: number): Promise<Oportunidade> {
    const oportunidade = await this.armazem.buscarOportunidade(id);
    if (!oportunidade) throw new NaoEncontrado(`Oportunidade ${id} não encontrada.`);
    return oportunidade;
  }

  private async tarefaGuardada(id: number): Promise<RegistroDeTarefa> {
    const tarefa = await this.armazem.buscarTarefa(id);
    if (!tarefa) throw new NaoEncontrado(`Tarefa ${id} não encontrada.`);
    return tarefa;
  }

  // ---------- Oportunidades ----------

  async listarOportunidades(filtro: { frente?: Frente; incluirPerdidas?: boolean } = {}): Promise<OportunidadeComPasso[]> {
    const frente = filtro.frente ? validarFrente(filtro.frente) : null;
    const { oportunidades } = await this.carregar();
    return oportunidades.filter((o) => (frente === null || o.frente === frente) && (filtro.incluirPerdidas || o.situacao !== 'Perdida'));
  }

  async buscarOportunidade(id: number): Promise<OportunidadeComPasso> {
    const [oportunidade, registros] = await Promise.all([this.oportunidadeGuardada(id), this.armazem.listarTarefas('abertas')]);
    const abertas = registros.filter((r) => r.oportunidadeId === id).map((r) => montarTarefa(r, oportunidade));
    return comProximoPasso([oportunidade], abertas)[0]!;
  }

  async criarOportunidade(dados: NovaOportunidade): Promise<OportunidadeComPasso> {
    const nome = texto(dados.nome);
    if (!nome) throw new ErroDeValidacao('A oportunidade precisa de um nome.');
    const agora = this.agoraIso();
    const criada = await this.armazem.inserirOportunidade({
      nome,
      frente: validarFrente(dados.frente),
      situacao: validarSituacao(dados.situacao ?? 'Ideia'),
      valorCentavos: validarValor(dados.valorCentavos),
      prazo: texto(dados.prazo),
      link: texto(dados.link),
      contato: texto(dados.contato),
      observacoes: texto(dados.observacoes),
      criadaEm: agora,
      atualizadaEm: agora,
    });
    // Acabou de nascer: ainda não tem nenhuma Tarefa.
    return comProximoPasso([criada], [])[0]!;
  }

  async atualizarOportunidade(id: number, mudanca: MudancaOportunidade): Promise<OportunidadeComPasso> {
    const atual = await this.oportunidadeGuardada(id);
    const nome = mudanca.nome === undefined ? atual.nome : texto(mudanca.nome);
    if (!nome) throw new ErroDeValidacao('A oportunidade precisa de um nome.');
    const escolher = <T,>(novo: T | undefined, velho: T) => (novo === undefined ? velho : novo);
    await this.armazem.gravarOportunidade({
      id,
      nome,
      frente: validarFrente(escolher(mudanca.frente, atual.frente)),
      situacao: validarSituacao(escolher(mudanca.situacao, atual.situacao)),
      valorCentavos: validarValor(escolher(mudanca.valorCentavos, atual.valorCentavos)),
      prazo: mudanca.prazo === undefined ? atual.prazo : texto(mudanca.prazo),
      link: mudanca.link === undefined ? atual.link : texto(mudanca.link),
      contato: mudanca.contato === undefined ? atual.contato : texto(mudanca.contato),
      observacoes: mudanca.observacoes === undefined ? atual.observacoes : texto(mudanca.observacoes),
      criadaEm: atual.criadaEm,
      atualizadaEm: this.agoraIso(),
    });
    return this.buscarOportunidade(id);
  }

  // ---------- Tarefas ----------

  async listarTarefas(
    filtro: { estado?: 'abertas' | 'feitas' | 'todas'; frente?: Frente | 'sem-frente'; oportunidadeId?: number } = {},
  ): Promise<Tarefa[]> {
    const estado = filtro.estado ?? 'abertas';
    const frente = filtro.frente === undefined || filtro.frente === 'sem-frente' ? null : validarFrente(filtro.frente);
    const [registros, oportunidades] = await Promise.all([this.armazem.listarTarefas(estado), this.armazem.listarOportunidades()]);
    const tarefas = montarTarefas(registros, oportunidades).filter((t) => {
      if (filtro.oportunidadeId !== undefined && t.oportunidadeId !== filtro.oportunidadeId) return false;
      if (filtro.frente === 'sem-frente') return t.frente === null;
      return frente === null || t.frente === frente;
    });
    // As feitas aparecem da mais recente para a mais antiga.
    if (estado === 'feitas') return tarefas.sort((a, b) => (a.feitaEm! < b.feitaEm! ? 1 : a.feitaEm! > b.feitaEm! ? -1 : b.id - a.id));
    return tarefas.sort(ordemDeTarefa);
  }

  async buscarTarefa(id: number): Promise<Tarefa> {
    const registro = await this.tarefaGuardada(id);
    const oportunidade = registro.oportunidadeId === null ? null : await this.armazem.buscarOportunidade(registro.oportunidadeId);
    return montarTarefa(registro, oportunidade);
  }

  async criarTarefa(dados: NovaTarefa): Promise<Tarefa> {
    const titulo = texto(dados.titulo);
    if (!titulo) throw new ErroDeValidacao('A tarefa precisa de um título.');
    const dia = texto(dados.dia);
    const hora = texto(dados.hora);
    validarDiaEHora(dia, hora);
    const frente = dados.frente ? validarFrente(dados.frente) : null;
    const oportunidadeId = dados.oportunidadeId ?? null;
    const oportunidade = oportunidadeId === null ? null : await this.oportunidadeGuardada(oportunidadeId);
    const registro = await this.armazem.inserirTarefa({
      titulo,
      dia,
      hora,
      oportunidadeId,
      repositorio: texto(dados.repositorio),
      frente,
      naAgenda: false,
      feitaEm: null,
      criadaEm: this.agoraIso(),
    });
    return montarTarefa(registro, oportunidade);
  }

  async atualizarTarefa(id: number, mudanca: MudancaTarefa): Promise<Tarefa> {
    const atual = await this.tarefaGuardada(id);
    const titulo = mudanca.titulo === undefined ? atual.titulo : texto(mudanca.titulo);
    if (!titulo) throw new ErroDeValidacao('A tarefa precisa de um título.');
    const dia = mudanca.dia === undefined ? atual.dia : texto(mudanca.dia);
    // Tirar o dia também tira a hora.
    const hora = mudanca.hora === undefined ? (dia === null ? null : atual.hora) : texto(mudanca.hora);
    validarDiaEHora(dia, hora);
    const frente = mudanca.frente === undefined ? atual.frente : mudanca.frente ? validarFrente(mudanca.frente) : null;
    const oportunidadeId = mudanca.oportunidadeId === undefined ? atual.oportunidadeId : mudanca.oportunidadeId;
    const oportunidade = oportunidadeId === null ? null : await this.oportunidadeGuardada(oportunidadeId);
    const feitaEm = mudanca.feita === undefined ? atual.feitaEm : mudanca.feita ? (atual.feitaEm ?? this.agoraIso()) : null;
    // Mudar dia ou hora invalida o compromisso que já foi para o Google Agenda.
    const mudouHorario = dia !== atual.dia || hora !== atual.hora;
    const naAgenda = mudanca.naAgenda ?? (mudouHorario ? false : atual.naAgenda);
    const nova: RegistroDeTarefa = {
      id,
      titulo,
      dia,
      hora,
      oportunidadeId,
      repositorio: mudanca.repositorio === undefined ? atual.repositorio : texto(mudanca.repositorio),
      frente,
      naAgenda: naAgenda && hora !== null,
      feitaEm,
      criadaEm: atual.criadaEm,
    };
    await this.armazem.gravarTarefa(nova);
    return montarTarefa(nova, oportunidade);
  }

  async apagarTarefa(id: number): Promise<void> {
    await this.tarefaGuardada(id);
    await this.armazem.apagarTarefa(id);
  }

  // ---------- Hoje ----------

  async hoje(): Promise<Hoje> {
    const dia = diaDeHoje(this.relogio());
    const limite = somarDias(dia, DIAS_DE_PROXIMOS);
    const { oportunidades, abertas } = await this.carregar();
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

  frentesDosRepositorios(): Promise<Map<string, Frente | null>> {
    return this.armazem.frentesDosRepositorios();
  }

  async definirFrenteDoRepositorio(nome: string, frente: Frente | null): Promise<void> {
    const limpo = texto(nome);
    if (!limpo) throw new ErroDeValidacao('Informe o nome do repositório.');
    await this.armazem.gravarFrenteDoRepositorio(limpo, frente === null ? null : validarFrente(frente));
  }

  async tema(): Promise<Tema> {
    const valor = await this.armazem.lerPreferencia('tema');
    return TEMAS.includes(valor as Tema) ? (valor as Tema) : 'coral';
  }

  async definirTema(tema: Tema): Promise<Tema> {
    if (!TEMAS.includes(tema)) throw new ErroDeValidacao(`Tema inválido. Use ${TEMAS.join(', ')}.`);
    await this.armazem.gravarPreferencia('tema', tema);
    return tema;
  }

  /** Sem conexão, o painel mostra a última leitura guardada no aparelho e não grava. */
  estadoDosDados(): EstadoDosDados {
    return this.armazem.estado();
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

