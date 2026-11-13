// Um arquivo de dados que mora na memória. Serve para os testes do armazém.

import { ConflitoDeVersao, type ArquivoDeDados, type Copia, type CopiaLocal } from './armazem-arquivo.ts';
import { SemConexao } from './tipos.ts';

export class ArquivoNaMemoria implements ArquivoDeDados {
  texto: string | null = null;
  leituras = 0;
  /** As mensagens de cada gravação, na ordem. */
  gravacoes: string[] = [];
  /** Liga para imitar a falta de internet: ler e gravar falham como o GitHub sem resposta. */
  foraDoAr = false;
  private numero = 0;

  private get versao(): string | null {
    return this.texto === null ? null : String(this.numero);
  }

  async ler(): Promise<{ texto: string; versao: string } | null> {
    this.leituras++;
    if (this.foraDoAr) throw new SemConexao('Não consegui falar com o GitHub.');
    return this.texto === null ? null : { texto: this.texto, versao: this.versao! };
  }

  async gravar(texto: string, versaoAnterior: string | null, mensagem: string): Promise<string> {
    if (this.foraDoAr) throw new SemConexao('Não consegui falar com o GitHub.');
    if (versaoAnterior !== this.versao) throw new ConflitoDeVersao();
    this.texto = texto;
    this.numero++;
    this.gravacoes.push(mensagem);
    return this.versao!;
  }
}

/** A cópia que o aparelho guarda da última leitura, na memória. */
export class CopiaNaMemoria implements CopiaLocal {
  guardada: Copia | null = null;
  gravacoes = 0;

  async ler(): Promise<Copia | null> {
    return this.guardada;
  }

  async gravar(copia: Copia): Promise<void> {
    this.guardada = copia;
    this.gravacoes++;
  }
}
