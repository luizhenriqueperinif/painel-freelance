// O painel dentro do app de Android. Lá não há servidor: as telas usam a mesma camada de
// ações (src/dominio/painel.ts) e falam direto com o repositório de dados no GitHub (docs/adr/0002).
// O token fica guardado só no celular, pelo lado Android do app (AvisosPlugin.java).

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { CopiaLocal } from '../../src/dominio/armazem-arquivo.ts';
import type { Painel } from '../../src/dominio/painel.ts';

export const noCelular = Capacitor.isNativePlatform();

export interface Configuracao {
  repositorio: string;
  token: string;
}

export interface EstadoDosAvisos {
  avisosPermitidos: boolean;
  /** O Android deixa o aviso tocar no minuto certo (e não alguns minutos depois). */
  naHoraCerta: boolean;
  agendados: number;
  /** Quando a conferência por trás leu o GitHub pela última vez (ms). */
  ultimaConferencia?: number;
  problema?: string;
}

interface PluginAvisos {
  configuracao(): Promise<Partial<Configuracao>>;
  configurar(configuracao: Configuracao): Promise<void>;
  esquecer(): Promise<void>;
  lerCopia(): Promise<{ texto?: string; versao?: string; lidaEm?: number }>;
  gravarCopia(copia: { texto: string; versao: string; lidaEm: number }): Promise<void>;
  estado(): Promise<EstadoDosAvisos>;
  pedirPermissao(): Promise<EstadoDosAvisos>;
  abrirAjustes(): Promise<void>;
}

export const avisos = registerPlugin<PluginAvisos>('Avisos');

/** A cópia do aparelho mora no lado Android: cada leitura nova guardada lá também refaz os avisos. */
const copiaNoCelular: CopiaLocal = {
  async ler() {
    const { texto, versao, lidaEm } = await avisos.lerCopia();
    return texto && versao && lidaEm !== undefined ? { texto, versao, lidaEm } : null;
  },
  gravar: (copia) => avisos.gravarCopia(copia),
};

let configuracao: Configuracao | null = null;
let painelAberto: Promise<Painel> | null = null;

export async function lerConfiguracao(): Promise<Configuracao | null> {
  const { repositorio, token } = await avisos.configuracao();
  configuracao = repositorio && token ? { repositorio, token } : null;
  return configuracao;
}

/** O Painel do celular. As peças só são carregadas aqui, então o site do PC não leva nada disso. */
export function painelDoCelular(): Promise<Painel> {
  painelAberto ??= (async () => {
    const atual = configuracao ?? (await lerConfiguracao());
    if (!atual) throw new Error('Falta configurar o repositório de dados e o token em "ajustes".');
    const [{ Painel }, { ArmazemEmArquivo }, { ArquivoNoGithub }] = await Promise.all([
      import('../../src/dominio/painel.ts'),
      import('../../src/dominio/armazem-arquivo.ts'),
      import('../../src/dominio/arquivo-github.ts'),
    ]);
    const arquivo = new ArquivoNoGithub({ repositorio: atual.repositorio, token: () => atual.token });
    return new Painel(new ArmazemEmArquivo(arquivo, undefined, copiaNoCelular));
  })();
  painelAberto.catch(() => (painelAberto = null));
  return painelAberto;
}

/**
 * Confere se o token abre o repositório antes de guardar. Devolve se o painel.json já existe
 * (um repositório novo começa vazio, e o arquivo nasce na primeira gravação).
 */
export async function conferirAcesso(repositorio: string, token: string): Promise<{ temDados: boolean }> {
  const { ArquivoNoGithub } = await import('../../src/dominio/arquivo-github.ts');
  const lido = await new ArquivoNoGithub({ repositorio, token: () => token }).ler();
  return { temDados: lido !== null };
}

export async function configurar(nova: Configuracao): Promise<void> {
  await avisos.configurar(nova);
  configuracao = nova;
  painelAberto = null;
}

export async function esquecer(): Promise<void> {
  await avisos.esquecer();
  configuracao = null;
  painelAberto = null;
}
