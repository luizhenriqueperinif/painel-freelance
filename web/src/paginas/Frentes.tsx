import { useState } from 'react';
import { FRENTES, type OportunidadeComPasso } from '../../../src/dominio/tipos.ts';
import { Topo } from '../App.tsx';
import { api } from '../api.ts';
import { Erro, useCarregar } from '../componentes.tsx';
import { classeDaSituacao, quando, reais } from '../formato.ts';
import { DialogoOportunidade } from './DialogoOportunidade.tsx';

export function PaginaFrentes() {
  const [perdidas, setPerdidas] = useState(false);
  const { dados, erro, recarregar } = useCarregar(() => Promise.all([api.oportunidades(true), api.hoje()]), []);
  const [editando, setEditando] = useState<OportunidadeComPasso | 'nova' | null>(null);

  const todas = dados?.[0] ?? [];
  const hoje = dados?.[1].dia ?? '';
  const visiveis = todas.filter((o) => o.situacao !== 'Perdida');
  const listaDePerdidas = todas.filter((o) => o.situacao === 'Perdida');
  const propostas = todas.filter((o) => o.situacao === 'Proposta enviada').length;

  return (
    <>
      <Topo titulo="Frentes" sub={`${visiveis.length} oportunidades // ${propostas} propostas no ar`} />
      <Erro mensagem={erro} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }} className="suave">
          <input type="checkbox" checked={perdidas} onChange={(e) => setPerdidas(e.target.checked)} /> Mostrar perdidas
        </label>
        <button type="button" className="btn corte-p" style={{ marginLeft: 'auto' }} onClick={() => setEditando('nova')}>
          Nova oportunidade
        </button>
      </div>

      <div className="grade-4">
        {FRENTES.map((frente) => {
          const daFrente = visiveis.filter((o) => o.frente === frente);
          return (
            <section key={frente} className="p corte col" aria-label={frente}>
              <h2 style={daFrente.length === 0 ? { color: 'var(--suave)' } : undefined}>
                {frente} <span>{daFrente.length}</span>
              </h2>
              {daFrente.length === 0 && (
                <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.5, border: '1px dashed var(--linha-forte)', padding: 14 }}>
                  Nenhuma oportunidade ainda.
                </p>
              )}
              <div className="cartoes">
                {daFrente.map((o) => (
                  <Cartao key={o.id} oportunidade={o} hoje={hoje} aoAbrir={() => setEditando(o)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {perdidas && (
        <section className="p corte">
          <h2 className="rot">Perdidas · {listaDePerdidas.length}</h2>
          {listaDePerdidas.length === 0 && <p className="vazio">Nenhuma.</p>}
          <div className="grade-4">
            {listaDePerdidas.map((o) => (
              <Cartao key={o.id} oportunidade={o} hoje={hoje} aoAbrir={() => setEditando(o)} />
            ))}
          </div>
        </section>
      )}

      {editando && (
        <DialogoOportunidade
          oportunidade={editando === 'nova' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            void recarregar();
          }}
        />
      )}
    </>
  );
}

function Cartao({ oportunidade: o, hoje, aoAbrir }: { oportunidade: OportunidadeComPasso; hoje: string; aoAbrir: () => void }) {
  const detalhes = [o.valorCentavos !== null ? reais(o.valorCentavos) : 'sem valor', o.prazo].filter(Boolean).join(' · ');
  return (
    <button type="button" className="cartao corte-p" onClick={aoAbrir} aria-label={`Abrir ${o.nome}`}>
      <p className="cartao-titulo">{o.nome}</p>
      <span className={`chip ${classeDaSituacao(o.situacao)}`}>{o.situacao}</span>
      <p className="cartao-valor">{detalhes}</p>
      {o.proximoPasso && (
        <p className="cartao-passo">
          {o.proximoPasso.dia ? `${quando(o.proximoPasso, hoje)} · ` : ''}
          {o.proximoPasso.titulo}
        </p>
      )}
      {o.parada && <p className="cartao-parada">Parada: sem próximo passo</p>}
    </button>
  );
}
