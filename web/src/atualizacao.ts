// O app de Android procura versão nova nas Releases do repositório do código (público).
// O Android não deixa um app de fora da Play Store se atualizar em silêncio: a tela avisa,
// a pessoa baixa e confirma "Instalar", e o app novo entra por cima com o token e os dados.

const REPOSITORIO_DO_CODIGO = 'luizhenriqueperinif/painel-freelance';
/** Sempre o APK da Release mais nova. É também o link para instalar a primeira vez. */
export const LINK_DO_APK = `https://github.com/${REPOSITORIO_DO_CODIGO}/releases/latest/download/painel-freelance.apk`;
// Fora do build (nos testes) a constante não existe.
export const VERSAO_DO_APP = typeof __VERSAO_DO_APP__ === 'undefined' ? '0.0.0' : __VERSAO_DO_APP__;

/** O GitHub atende 60 consultas por hora sem login: uma a cada 6 horas basta. */
const INTERVALO_MS = 6 * 60 * 60 * 1000;
const CHAVE = 'versao-nova';

function numeros(versao: string): number[] {
  return versao.replace(/^v/, '').split('.').map((parte) => Number.parseInt(parte, 10) || 0);
}

export function ehMaisNova(candidata: string, atual: string): boolean {
  const [a, b] = [numeros(candidata), numeros(atual)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

function lerGuardado(): { conferidaEm: number; versao: string | null } | null {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as { conferidaEm: number; versao: string | null } | null;
  } catch {
    return null;
  }
}

/** A versão nova, se houver. Sem internet ou com o GitHub fora, simplesmente não avisa. */
export async function procurarVersaoNova(agora = Date.now()): Promise<string | null> {
  const guardado = lerGuardado();
  let versao = guardado?.versao ?? null;
  if (!guardado || agora - guardado.conferidaEm > INTERVALO_MS) {
    try {
      const resposta = await fetch(`https://api.github.com/repos/${REPOSITORIO_DO_CODIGO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resposta.ok) return null;
      versao = ((await resposta.json()) as { tag_name?: string }).tag_name ?? null;
      try {
        localStorage.setItem(CHAVE, JSON.stringify({ conferidaEm: agora, versao }));
      } catch {
        /* sem armazenamento: confere de novo na próxima abertura */
      }
    } catch {
      return null;
    }
  }
  return versao && ehMaisNova(versao, VERSAO_DO_APP) ? versao.replace(/^v/, '') : null;
}
