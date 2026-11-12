// Monta links do Google Agenda já preenchidos. O Luiz só clica em "Salvar".
// Não usa a API do Google: nada de credencial na v1.

const FUSO = 'America/Sao_Paulo';
const DURACAO_PADRAO_MIN = 30;

function compacto(dia: string, hora: string): string {
  return `${dia.replaceAll('-', '')}T${hora.replace(':', '')}00`;
}

function somarMinutos(dia: string, hora: string, minutos: number): { dia: string; hora: string } {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
  const [h, min] = hora.split(':').map(Number) as [number, number];
  const data = new Date(Date.UTC(a, m - 1, d, h, min + minutos));
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return {
    dia: `${data.getUTCFullYear()}-${doisDigitos(data.getUTCMonth() + 1)}-${doisDigitos(data.getUTCDate())}`,
    hora: `${doisDigitos(data.getUTCHours())}:${doisDigitos(data.getUTCMinutes())}`,
  };
}

export function linkDoCompromisso(opcoes: {
  titulo: string;
  dia: string;
  hora: string;
  detalhes?: string | null;
  repetirTodoDia?: boolean;
}): string {
  const fim = somarMinutos(opcoes.dia, opcoes.hora, DURACAO_PADRAO_MIN);
  const parametros = new URLSearchParams({
    action: 'TEMPLATE',
    text: opcoes.titulo,
    dates: `${compacto(opcoes.dia, opcoes.hora)}/${compacto(fim.dia, fim.hora)}`,
    ctz: FUSO,
  });
  if (opcoes.detalhes) parametros.set('details', opcoes.detalhes);
  if (opcoes.repetirTodoDia) parametros.set('recur', 'RRULE:FREQ=DAILY');
  return `https://calendar.google.com/calendar/render?${parametros.toString()}`;
}
