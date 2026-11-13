// O que a tela sabe sobre a conexão do painel com o repositório de dados.
// Cada resposta do servidor atualiza este estado (api.ts), e o aviso do topo lê daqui.

import { useSyncExternalStore } from 'react';

/** O servidor está sem conexão e não tem nenhuma leitura guardada para mostrar. */
export const SEM_COPIA = 'sem-copia';

/** null: os dados são os de agora. Senão, a hora (ISO) da leitura mostrada, ou SEM_COPIA. */
let dadosDe: string | null = null;
const ouvintes = new Set<() => void>();

export function anotarConexao(valor: string | null) {
  if (valor === dadosDe) return;
  dadosDe = valor;
  for (const avisar of ouvintes) avisar();
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  return () => {
    ouvintes.delete(avisar);
  };
}

export function useDadosDe(): string | null {
  return useSyncExternalStore(assinar, () => dadosDe);
}
