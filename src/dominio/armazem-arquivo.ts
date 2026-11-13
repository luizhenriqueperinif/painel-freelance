// Armazém que guarda o painel inteiro num arquivo JSON só. O arquivo pode estar num
// repositório privado do GitHub (arquivo-github.ts) ou na memória (nos testes).
// Não usa nada do Node: roda igual no navegador e no celular (docs/adr/0002).
//
// Vários aparelhos gravam no mesmo arquivo. Para ninguém apagar o que o outro fez, toda
// gravação diz qual versão do arquivo ela leu. Se a versão já mudou, o armazém lê de novo
// e refaz só a mudança pedida em cima do arquivo novo.

import type { Armazem, RegistroDeTarefa } from './armazem.ts';
import { ErroDeArmazenamento, type Frente, type Oportunidade } from './tipos.ts';

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

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class ArmazemEmArquivo implements Armazem {
  private readonly arquivo: ArquivoDeDados;
  private readonly agora: () => number;
  private atual: Lido | null = null;
  private lendo: Promise<Lido> | null = null;
  private fila: Promise<unknown> = Promise.resolve();

  constructor(arquivo: ArquivoDeDados, agora: () => number = () => Date.now()) {
    this.arquivo = arquivo;
    this.agora = agora;
  }

  private async carregar(deNovo = false): Promise<Lido> {
    if (!deNovo && this.atual && this.agora() - this.atual.lidoEm < VALIDADE_DA_LEITURA_MS) return this.atual;
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
        return this.atual;
      } finally {
        this.lendo = null;
      }
    })();
    return this.lendo;
  }

  /** Aplica uma mudança e grava. As gravações deste aparelho entram em fila, uma de cada vez. */
  private alterar<T>(mudar: (dados: DadosDoPainel) => Mudanca<T>): Promise<T> {
    const vez = this.fila.then(async () => {
      for (let tentativa = 1; tentativa <= TENTATIVAS_DE_GRAVAR; tentativa++) {
        // Depois de um conflito, lê o arquivo de novo e refaz a mudança em cima dele.
        const lido = await this.carregar(tentativa > 1);
        const dados = structuredClone(lido.dados);
        const { resultado, mensagem } = mudar(dados);
        if (mensagem === null) return resultado;
        try {
          const versao = await this.arquivo.gravar(paraTexto(dados), lido.versao, mensagem);
          this.atual = { dados, versao, lidoEm: this.agora() };
          return resultado;
        } catch (erro) {
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
