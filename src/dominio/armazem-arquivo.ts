// Armazém que guarda o painel inteiro num arquivo JSON só. O arquivo pode estar num
// repositório privado do GitHub (arquivo-github.ts) ou na memória (nos testes).
// Não usa nada do Node: roda igual no navegador e no celular (docs/adr/0002).
//
// Vários aparelhos gravam no mesmo arquivo. Para ninguém apagar o que o outro fez, toda
// gravação diz qual versão do arquivo ela leu. Se a versão já mudou, o armazém lê de novo
// e refaz só a mudança pedida em cima do arquivo novo.
//
// Quando o arquivo não responde (sem internet), o armazém mostra a última leitura boa, que
// também fica guardada no aparelho, e avisa pelo estado(). Gravar só volta com a conexão.

import type { Armazem, RegistroDeTarefa } from './armazem.ts';
import { ErroDeArmazenamento, SemConexao, type EstadoDosDados, type Frente, type Oportunidade } from './tipos.ts';

/** O arquivo onde os dados moram. A versão muda a cada gravação. */
export interface ArquivoDeDados {
  /** O texto e a versão de agora, ou null se o arquivo ainda não existe. */
  ler(): Promise<{ texto: string; versao: string } | null>;
  /**
   * Grava por cima da versão informada (null para criar o arquivo) e devolve a versão nova.
   * Lança ConflitoDeVersao se alguém gravou depois daquela versão. A mensagem conta o que mudou.
   */
  gravar(texto: string, versaoAnterior: string | null, mensagem: string): Promise<string>;
}

/** Outro aparelho gravou no arquivo depois da última leitura. */
export class ConflitoDeVersao extends Error {
  constructor() {
    super('O arquivo de dados mudou depois da última leitura.');
    this.name = 'ConflitoDeVersao';
  }
}

/** A última leitura boa do arquivo, com a hora (em milissegundos) em que foi feita. */
export interface Copia {
  texto: string;
  versao: string;
  lidaEm: number;
}

/** Onde o aparelho guarda a última leitura, para mostrar quando o arquivo não responde. */
export interface CopiaLocal {
  ler(): Promise<Copia | null>;
  gravar(copia: Copia): Promise<void>;
}

export const FORMATO = 1;

export interface DadosDoPainel {
  /** Muda quando o desenho do arquivo muda. Um painel antigo se recusa a mexer num formato mais novo. */
  formato: typeof FORMATO;
  proximaOportunidade: number;
  proximaTarefa: number;
  oportunidades: Oportunidade[];
  tarefas: RegistroDeTarefa[];
  /** A frente que o Luiz escolheu para cada Repositório, pelo nome. */
  frentesDosRepositorios: Record<string, Frente | null>;
  preferencias: Record<string, string>;
}

export function dadosVazios(): DadosDoPainel {
  return { formato: FORMATO, proximaOportunidade: 1, proximaTarefa: 1, oportunidades: [], tarefas: [], frentesDosRepositorios: {}, preferencias: {} };
}

// Os campos saem sempre na mesma ordem, para o histórico do repositório mostrar só o que mudou.
function arrumarOportunidade(o: Oportunidade): Oportunidade {
  return {
    id: o.id,
    nome: o.nome,
    frente: o.frente,
    situacao: o.situacao,
    valorCentavos: o.valorCentavos,
    prazo: o.prazo,
    link: o.link,
    contato: o.contato,
    observacoes: o.observacoes,
    criadaEm: o.criadaEm,
    atualizadaEm: o.atualizadaEm,
  };
}

function arrumarTarefa(t: RegistroDeTarefa): RegistroDeTarefa {
  return {
    id: t.id,
    titulo: t.titulo,
    dia: t.dia,
    hora: t.hora,
    oportunidadeId: t.oportunidadeId,
    repositorio: t.repositorio,
    frente: t.frente,
    naAgenda: t.naAgenda,
    feitaEm: t.feitaEm,
    criadaEm: t.criadaEm,
  };
}

function emOrdem<T>(objeto: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(objeto).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function paraTexto(dados: DadosDoPainel): string {
  const arrumado: DadosDoPainel = {
    formato: FORMATO,
    proximaOportunidade: dados.proximaOportunidade,
    proximaTarefa: dados.proximaTarefa,
    oportunidades: [...dados.oportunidades].sort((a, b) => a.id - b.id).map(arrumarOportunidade),
    tarefas: [...dados.tarefas].sort((a, b) => a.id - b.id).map(arrumarTarefa),
    frentesDosRepositorios: emOrdem(dados.frentesDosRepositorios),
    preferencias: emOrdem(dados.preferencias),
  };
  return `${JSON.stringify(arrumado, null, 2)}\n`;
}

export function deTexto(texto: string): DadosDoPainel {
  let lido: Partial<DadosDoPainel> & { formato?: unknown };
  try {
    lido = JSON.parse(texto) as typeof lido;
  } catch {
    throw new ErroDeArmazenamento('O arquivo de dados do painel está estragado (não é um JSON válido). Nada foi alterado; confira o histórico do repositório.');
  }
  if (lido === null || typeof lido !== 'object' || lido.formato !== FORMATO) {
    throw new ErroDeArmazenamento(
      `O arquivo de dados está num formato (${String(lido?.formato)}) que esta versão do painel não conhece. Atualize o painel antes de usar.`,
    );
  }
  const vazio = dadosVazios();
  return {
    formato: FORMATO,
    proximaOportunidade: lido.proximaOportunidade ?? vazio.proximaOportunidade,
    proximaTarefa: lido.proximaTarefa ?? vazio.proximaTarefa,
    oportunidades: lido.oportunidades ?? [],
    tarefas: lido.tarefas ?? [],
    frentesDosRepositorios: lido.frentesDosRepositorios ?? {},
    preferencias: lido.preferencias ?? {},
  };
}

interface Lido {
  dados: DadosDoPainel;
  versao: string | null;
  lidoEm: number;
}

/** O que uma mudança devolve: o resultado e a mensagem do histórico. Sem mensagem, nada é gravado. */
interface Mudanca<T> {
  resultado: T;
  mensagem: string | null;
}

/** Por este tempo depois de ler, o armazém responde da memória sem perguntar de novo ao arquivo. */
const VALIDADE_DA_LEITURA_MS = 2000;
const TENTATIVAS_DE_GRAVAR = 5;
/** Depois de uma falha de conexão, espera este tempo antes de procurar o arquivo de novo. */
const ESPERA_SEM_CONEXAO_MS = 10_000;
/** Sem mudança no arquivo, a cópia do aparelho é regravada neste intervalo, para a hora dela não ficar para trás. */
const INTERVALO_DA_COPIA_MS = 60_000;

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class ArmazemEmArquivo implements Armazem {
  private readonly arquivo: ArquivoDeDados;
  private readonly agora: () => number;
  private readonly copia: CopiaLocal | null;
  private atual: Lido | null = null;
  private lendo: Promise<Lido> | null = null;
  private fila: Promise<unknown> = Promise.resolve();
  /** Quando o arquivo deixou de responder pela última vez. null enquanto a conexão está boa. */
  private falhouEm: number | null = null;
  private copiaGravada: { versao: string; em: number } | null = null;

  constructor(arquivo: ArquivoDeDados, agora: () => number = () => Date.now(), copia: CopiaLocal | null = null) {
    this.arquivo = arquivo;
    this.agora = agora;
    this.copia = copia;
  }

  estado(): EstadoDosDados {
    if (this.falhouEm === null) return { semConexao: false, dadosDe: null };
    return { semConexao: true, dadosDe: this.atual ? new Date(this.atual.lidoEm).toISOString() : null };
  }

  private semConexaoHaPouco(): boolean {
    return this.falhouEm !== null && this.agora() - this.falhouEm < ESPERA_SEM_CONEXAO_MS;
  }

  /**
   * Os dados para uma consulta. Sem conexão, devolve a última leitura boa (da memória ou da
   * cópia do aparelho). Com deNovo, só vale o que o arquivo responder agora: é o que as gravações usam.
   */
  private async carregar(deNovo = false): Promise<Lido> {
    if (!deNovo && this.atual) {
      if (this.falhouEm === null) {
        if (this.agora() - this.atual.lidoEm < VALIDADE_DA_LEITURA_MS) return this.atual;
      } else {
        // Sem conexão a tela não fica esperando: recebe o que já tem, e a nova tentativa corre por trás.
        if (!this.semConexaoHaPouco()) void this.lerDoArquivo().catch(() => undefined);
        return this.atual;
      }
    }
    try {
      return await this.lerDoArquivo();
    } catch (erro) {
      if (deNovo || !(erro instanceof SemConexao)) throw erro;
      const guardado = this.atual ?? (await this.lerDaCopia());
      if (!guardado) throw erro;
      return guardado;
    }
  }

  private lerDoArquivo(): Promise<Lido> {
    // Várias consultas ao mesmo tempo dividem uma leitura só.
    this.lendo ??= (async () => {
      try {
        const lido = await this.arquivo.ler();
        const mesmaVersao = this.atual !== null && lido !== null && lido.versao === this.atual.versao;
        this.atual = {
          dados: mesmaVersao ? this.atual!.dados : lido ? deTexto(lido.texto) : dadosVazios(),
          versao: lido?.versao ?? null,
          lidoEm: this.agora(),
        };
        this.falhouEm = null;
        if (lido) await this.guardarCopia(lido.texto, lido.versao);
        return this.atual;
      } catch (erro) {
        // Qualquer outra recusa (token, repositório, arquivo estragado) veio do próprio GitHub: há conexão.
        this.falhouEm = erro instanceof SemConexao ? this.agora() : null;
        throw erro;
      } finally {
        this.lendo = null;
      }
    })();
    return this.lendo;
  }

  private async lerDaCopia(): Promise<Lido | null> {
    try {
      const copia = await this.copia?.ler();
      if (!copia) return null;
      this.atual = { dados: deTexto(copia.texto), versao: copia.versao, lidoEm: copia.lidaEm };
      return this.atual;
    } catch {
      // Cópia estragada é como não ter cópia: vale o erro de conexão.
      return null;
    }
  }

  /** Guarda a leitura no aparelho. Se não der, o painel segue igual: a cópia é só um reforço. */
  private async guardarCopia(texto: string, versao: string): Promise<void> {
    if (!this.copia) return;
    const agora = this.agora();
    if (this.copiaGravada?.versao === versao && agora - this.copiaGravada.em < INTERVALO_DA_COPIA_MS) return;
    try {
      await this.copia.gravar({ texto, versao, lidaEm: agora });
      this.copiaGravada = { versao, em: agora };
    } catch {
      this.copiaGravada = null;
    }
  }

  /** Aplica uma mudança e grava. As gravações deste aparelho entram em fila, uma de cada vez. */
  private alterar<T>(mudar: (dados: DadosDoPainel) => Mudanca<T>): Promise<T> {
    const vez = this.fila.then(async () => {
      // O arquivo acabou de não responder: avisa na hora em vez de deixar a tela esperando de novo.
      if (this.semConexaoHaPouco()) throw new SemConexao('Sem conexão com o GitHub: não deu para gravar. Tente de novo quando a conexão voltar.');
      for (let tentativa = 1; tentativa <= TENTATIVAS_DE_GRAVAR; tentativa++) {
        // Depois de um conflito ou de uma queda de conexão, lê o arquivo de novo e faz a mudança em cima dele.
        const lido = await this.carregar(tentativa > 1 || this.falhouEm !== null);
        const dados = structuredClone(lido.dados);
        const { resultado, mensagem } = mudar(dados);
        if (mensagem === null) return resultado;
        try {
          const texto = paraTexto(dados);
          const versao = await this.arquivo.gravar(texto, lido.versao, mensagem);
          this.atual = { dados, versao, lidoEm: this.agora() };
          await this.guardarCopia(texto, versao);
          return resultado;
        } catch (erro) {
          if (erro instanceof SemConexao) this.falhouEm = this.agora();
          if (!(erro instanceof ConflitoDeVersao)) throw erro;
        }
      }
      throw new ErroDeArmazenamento('Não consegui gravar: outro aparelho está gravando ao mesmo tempo. Tente de novo em instantes.');
    });
    this.fila = vez.catch(() => undefined);
    return vez;
  }

  async listarOportunidades(): Promise<Oportunidade[]> {
    return (await this.carregar()).dados.oportunidades.map(arrumarOportunidade);
  }

  async buscarOportunidade(id: number): Promise<Oportunidade | null> {
    const achada = (await this.carregar()).dados.oportunidades.find((o) => o.id === id);
    return achada ? arrumarOportunidade(achada) : null;
  }

  inserirOportunidade(dados: Omit<Oportunidade, 'id'>): Promise<Oportunidade> {
    return this.alterar((painel) => {
      const nova = arrumarOportunidade({ ...dados, id: painel.proximaOportunidade++ });
      painel.oportunidades.push(nova);
      return { resultado: nova, mensagem: `Oportunidade ${nova.id} criada: ${nova.nome}` };
    });
  }

  gravarOportunidade(oportunidade: Oportunidade): Promise<void> {
    return this.alterar((painel) => {
      const posicao = painel.oportunidades.findIndex((o) => o.id === oportunidade.id);
      const nova = arrumarOportunidade(oportunidade);
      if (posicao < 0 || igual(painel.oportunidades[posicao], nova)) return { resultado: undefined, mensagem: null };
      const antes = painel.oportunidades[posicao]!;
      painel.oportunidades[posicao] = nova;
      const oQue = antes.situacao !== nova.situacao ? `passou para ${nova.situacao}` : 'alterada';
      return { resultado: undefined, mensagem: `Oportunidade ${nova.id} ${oQue}: ${nova.nome}` };
    });
  }

  async listarTarefas(quais: 'abertas' | 'feitas' | 'todas'): Promise<RegistroDeTarefa[]> {
    return (await this.carregar()).dados.tarefas
      .filter((t) => quais === 'todas' || (quais === 'abertas') === (t.feitaEm === null))
      .map(arrumarTarefa);
  }

  async buscarTarefa(id: number): Promise<RegistroDeTarefa | null> {
    const achada = (await this.carregar()).dados.tarefas.find((t) => t.id === id);
    return achada ? arrumarTarefa(achada) : null;
  }

  inserirTarefa(dados: Omit<RegistroDeTarefa, 'id'>): Promise<RegistroDeTarefa> {
    return this.alterar((painel) => {
      const nova = arrumarTarefa({ ...dados, id: painel.proximaTarefa++ });
      painel.tarefas.push(nova);
      return { resultado: nova, mensagem: `Tarefa ${nova.id} criada: ${nova.titulo}` };
    });
  }

  gravarTarefa(tarefa: RegistroDeTarefa): Promise<void> {
    return this.alterar((painel) => {
      const posicao = painel.tarefas.findIndex((t) => t.id === tarefa.id);
      const nova = arrumarTarefa(tarefa);
      if (posicao < 0 || igual(painel.tarefas[posicao], nova)) return { resultado: undefined, mensagem: null };
      const antes = painel.tarefas[posicao]!;
      painel.tarefas[posicao] = nova;
      const oQue = antes.feitaEm === null && nova.feitaEm !== null ? 'concluída' : antes.feitaEm !== null && nova.feitaEm === null ? 'reaberta' : 'alterada';
      return { resultado: undefined, mensagem: `Tarefa ${nova.id} ${oQue}: ${nova.titulo}` };
    });
  }

  apagarTarefa(id: number): Promise<void> {
    return this.alterar((painel) => {
      const posicao = painel.tarefas.findIndex((t) => t.id === id);
      if (posicao < 0) return { resultado: undefined, mensagem: null };
      const [apagada] = painel.tarefas.splice(posicao, 1);
      return { resultado: undefined, mensagem: `Tarefa ${id} apagada: ${apagada!.titulo}` };
    });
  }

  async frentesDosRepositorios(): Promise<Map<string, Frente | null>> {
    return new Map(Object.entries((await this.carregar()).dados.frentesDosRepositorios));
  }

  gravarFrenteDoRepositorio(nome: string, frente: Frente | null): Promise<void> {
    return this.alterar((painel) => {
      if (nome in painel.frentesDosRepositorios && painel.frentesDosRepositorios[nome] === frente) return { resultado: undefined, mensagem: null };
      painel.frentesDosRepositorios[nome] = frente;
      return { resultado: undefined, mensagem: `Repositório ${nome}: frente ${frente ?? 'nenhuma'}` };
    });
  }

  async lerPreferencia(chave: string): Promise<string | null> {
    return (await this.carregar()).dados.preferencias[chave] ?? null;
  }

  gravarPreferencia(chave: string, valor: string): Promise<void> {
    return this.alterar((painel) => {
      if (painel.preferencias[chave] === valor) return { resultado: undefined, mensagem: null };
      painel.preferencias[chave] = valor;
      return { resultado: undefined, mensagem: `Preferência ${chave}: ${valor}` };
    });
  }
}
