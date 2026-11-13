// Um arquivo de dados que mora na memória. Serve para os testes do armazém.

import { ConflitoDeVersao, type ArquivoDeDados } from './armazem-arquivo.ts';

export class ArquivoNaMemoria implements ArquivoDeDados {
  texto: string | null = null;
  leituras = 0;
  /** As mensagens de cada gravação, na ordem. */
  gravacoes: string[] = [];
  private numero = 0;

  private get versao(): string | null {
    return this.texto === null ? null : String(this.numero);
  }

  async ler(): Promise<{ texto: string; versao: string } | null> {
    this.leituras++;
    return this.texto === null ? null : { texto: this.texto, versao: this.versao! };
  }

  async gravar(texto: string, versaoAnterior: string | null, mensagem: string): Promise<string> {
    if (versaoAnterior !== this.versao) throw new ConflitoDeVersao();
    this.texto = texto;
    this.numero++;
    this.gravacoes.push(mensagem);
    return this.versao!;
  }
}
