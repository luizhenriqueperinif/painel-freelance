// O app de Android procura versão nova nas Releases do repositório do código (público).
// As telas se atualizam sozinhas: cada Release traz um telas.zip, que o app baixa e passa a usar
// (Telas.java). A parte Android (avisos, token) só muda com APK, porque o Android não deixa um app
// de fora da Play Store se instalar em silêncio: aí a tela avisa e a pessoa toca em Baixar e Instalar.

const REPOSITORIO_DO_CODIGO = 'luizhenriqueperinif/painel-freelance';
/** Sempre o APK da Release mais nova. É também o link para instalar a primeira vez. */
export const LINK_DO_APK = `https://github.com/${REPOSITORIO_DO_CODIGO}/releases/latest/download/painel-freelance.apk`;
// Fora do build (nos testes) a constante não existe.
export const VERSAO_DO_APP = typeof __VERSAO_DO_APP__ === 'undefined' ? '0.0.0' : __VERSAO_DO_APP__;

/** O GitHub atende 60 consultas por hora sem login: uma por hora fica longe disso. */
const INTERVALO_MS = 60 * 60 * 1000;
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

export interface VersaoNova {
  versao: string;
  /** O telas.zip da Release, quando ela traz um. */
  telas: string | null;
}

/** Tira da resposta do GitHub a versão e o pacote das telas. */
export function lerRelease(corpo: unknown): VersaoNova | null {
  const release = corpo as { tag_name?: unknown; assets?: { name?: unknown; browser_download_url?: unknown }[] } | null;
  if (typeof release?.tag_name !== 'string') return null;
  const telas = (release.assets ?? []).find((arquivo) => arquivo.name === 'telas.zip')?.browser_download_url;
  return { versao: release.tag_name.replace(/^v/, ''), telas: typeof telas === 'string' ? telas : null };
}

function lerGuardado(): { conferidaEm: number; release: VersaoNova | null } | null {
  try {
    const guardado = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as { conferidaEm?: number; release?: VersaoNova | null } | null;
    return typeof guardado?.conferidaEm === 'number' && guardado.release !== undefined
      ? { conferidaEm: guardado.conferidaEm, release: guardado.release }
      : null;
  } catch {
    return null;
  }
}

/** A versão nova, se houver. Sem internet ou com o GitHub fora, simplesmente não avisa. */
export async function procurarVersaoNova(agora = Date.now()): Promise<VersaoNova | null> {
  const guardado = lerGuardado();
  let release = guardado?.release ?? null;
  if (!guardado || agora - guardado.conferidaEm > INTERVALO_MS) {
    try {
      const resposta = await fetch(`https://api.github.com/repos/${REPOSITORIO_DO_CODIGO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resposta.ok) return null;
      release = lerRelease(await resposta.json());
      try {
        localStorage.setItem(CHAVE, JSON.stringify({ conferidaEm: agora, release }));
      } catch {
        /* sem armazenamento: confere de novo na próxima abertura */
      }
    } catch {
      return null;
    }
  }
  return release && ehMaisNova(release.versao, VERSAO_DO_APP) ? release : null;
}
