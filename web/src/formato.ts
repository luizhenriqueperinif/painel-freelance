import { diaDeHoje, horaEmBrasilia } from '../../src/dominio/datas.ts';
import type { Tarefa } from '../../src/dominio/tipos.ts';

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function data(dia: string): Date {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d));
}

export function diferencaEmDias(de: string, ate: string): number {
  return Math.round((data(ate).getTime() - data(de).getTime()) / 86_400_000);
}

/** "hoje 17:20", "amanhã", "sex 13 · 09:00", "sem data". */
export function quando(tarefa: Pick<Tarefa, 'dia' | 'hora'>, hoje: string): string {
  if (!tarefa.dia) return 'sem data';
  const distancia = diferencaEmDias(hoje, tarefa.dia);
  const d = data(tarefa.dia);
  let rotulo: string;
  if (distancia === 0) rotulo = 'hoje';
  else if (distancia === 1) rotulo = 'amanhã';
  else if (distancia === -1) rotulo = 'ontem';
  else rotulo = `${DIAS_DA_SEMANA[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return tarefa.hora ? `${rotulo} · ${tarefa.hora}` : rotulo;
}

/** Quando a tarefa foi concluída, no horário de Brasília: "feita hoje · 10:16", "feita qui 12/11 · 09:30". */
export function quandoFoiFeita(feitaEm: string, hoje: string): string {
  const instante = new Date(feitaEm);
  const dia = diaDeHoje(instante);
  const hora = horaEmBrasilia(instante);
  // De um ano para o outro, "qui 12/11" não diz de quando é.
  if (dia.slice(0, 4) !== hoje.slice(0, 4)) return `feita ${dia.slice(8)}/${dia.slice(5, 7)}/${dia.slice(0, 4)} · ${hora}`;
  return `feita ${quando({ dia, hora }, hoje)}`;
}

/** "quinta-feira, 12 de novembro" */
export function diaPorExtenso(dia: string): string {
  const d = data(dia);
  const semana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][d.getUTCDay()];
  return `${semana}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

const REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const reais = (centavos: number) => REAIS.format(centavos / 100);

/** Aceita "2.800", "2800,50" ou "R$ 300". Vazio vira null. */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/g, '');
  if (!limpo) return null;
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo.replace(/\.(?=\d{3}(\D|$))/g, '');
  const valor = Number(normalizado);
  if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor inválido. Use algo como 2.800 ou 350,00.');
  return Math.round(valor * 100);
}

export function centavosParaTexto(centavos: number | null): string {
  if (centavos === null) return '';
  return (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: centavos % 100 ? 2 : 0 });
}

/** Classe do chip: a primeira palavra da situação ("Proposta enviada" vira "Proposta"). */
export const classeDaSituacao = (situacao: string) => situacao.split(' ')[0]!;

export function tempoRelativo(iso: string, agora = new Date()): string {
  const dias = Math.floor((agora.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
