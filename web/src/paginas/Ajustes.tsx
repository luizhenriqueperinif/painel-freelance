import { useEffect, useState, type FormEvent } from 'react';
import { diaDeHoje, horaEmBrasilia } from '../../../src/dominio/datas.ts';
import { Topo } from '../App.tsx';
import { VERSAO_DO_APP } from '../atualizacao.ts';
import { avisos, conferirAcesso, configurar, esquecer, lerConfiguracao, type EstadoDosAvisos } from '../celular.ts';
import { Erro } from '../componentes.tsx';
import { quando } from '../formato.ts';

/** Só no app de Android: o repositório de dados, o token e os avisos. */
export function PaginaAjustes({ primeiraVez = false, aoConfigurar }: { primeiraVez?: boolean; aoConfigurar?: () => void }) {
  const [repositorio, setRepositorio] = useState('');
  const [token, setToken] = useState('');
  const [temToken, setTemToken] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [estado, setEstado] = useState<EstadoDosAvisos | null>(null);

  const lerEstado = () => avisos.estado().then(setEstado).catch(() => undefined);

  useEffect(() => {
    void lerConfiguracao().then((atual) => {
      if (!atual) return;
      setRepositorio(atual.repositorio);
      setTemToken(true);
    });
    void lerEstado();
  }, []);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const limpo = repositorio.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
    // Sem token novo, vale o que já está guardado.
    const chave = token.trim() || (temToken ? ((await lerConfiguracao())?.token ?? '') : '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(limpo)) return setErro('O repositório precisa estar no formato dono/nome.');
    if (!chave) return setErro('Cole o token do GitHub.');
    setSalvando(true);
    setErro(null);
    setRecado(null);
    try {
      const { temDados } = await conferirAcesso(limpo, chave);
      await configurar({ repositorio: limpo, token: chave });
      setToken('');
      setTemToken(true);
      setRepositorio(limpo);
      const permissao = await avisos.pedirPermissao().catch(() => null);
      if (permissao) setEstado(permissao);
      setRecado(temDados ? 'Pronto: o celular está ligado ao repositório de dados.' : 'Pronto. O repositório ainda não tem dados: o painel começa vazio e o arquivo nasce na primeira gravação.');
      aoConfigurar?.();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const desligar = async () => {
    if (!window.confirm('Tirar o token e os dados guardados deste celular? Os dados no GitHub não mudam.')) return;
    await esquecer();
    setTemToken(false);
    setToken('');
    setRecado('Este celular não guarda mais o token nem os dados.');
    void lerEstado();
    window.location.hash = '#/ajustes';
    window.location.reload();
  };

  const ultima = estado?.ultimaConferencia ? new Date(estado.ultimaConferencia) : null;

  return (
    <>
      <Topo titulo="Ajustes" sub={primeiraVez ? 'primeiro uso neste celular' : 'este celular'} />

      <form className="p corte dialogo" style={{ padding: 20 }} onSubmit={salvar}>
        <h2 className="rot" style={{ margin: 0 }}>
          Repositório de dados
        </h2>
        <label className="campo">
          Repositório privado (dono/nome)
          <input type="text" required value={repositorio} onChange={(e) => setRepositorio(e.target.value)} placeholder="seu-usuario/painel-freelance-dados" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </label>
        <label className="campo">
          Token do GitHub
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={temToken ? 'guardado neste celular (cole outro para trocar)' : 'cole aqui o token'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <details className="suave" style={{ fontSize: 14 }}>
          <summary style={{ cursor: 'pointer' }}>Como criar o token</summary>
          <ol style={{ paddingLeft: 20, margin: '8px 0 0' }}>
            <li>No GitHub: foto do perfil, Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.</li>
            <li>Em Repository access, escolha Only select repositories e marque só o repositório de dados.</li>
            <li>Em Permissions, Repository permissions, Contents: Read and write.</li>
            <li>Gere, copie e cole aqui. O token fica só neste celular; se perder o aparelho, revogue no GitHub.</li>
          </ol>
        </details>
        <Erro mensagem={erro} />
        {recado && (
          <p className="suave" role="status" style={{ margin: 0 }}>
            {recado}
          </p>
        )}
        <div className="acoes">
          <button type="submit" className="btn corte-p" disabled={salvando}>
            {salvando ? 'Conferindo' : 'Salvar'}
          </button>
        </div>
      </form>

      {temToken && (
        <section className="p corte" aria-labelledby="t-avisos">
          <h2 className="rot" id="t-avisos">
            Avisos das tarefas com hora
          </h2>
          <p style={{ margin: '0 0 10px' }}>15 minutos antes e na hora de cada tarefa aberta com hora.</p>
          {estado && (
            <ul className="suave" style={{ paddingLeft: 20, margin: '0 0 12px', fontSize: 14 }}>
              <li>Notificações: {estado.avisosPermitidos ? 'permitidas' : 'bloqueadas'}</li>
              <li>{estado.naHoraCerta ? 'Avisos no minuto certo' : 'O Android pode atrasar os avisos alguns minutos'}</li>
              <li>Avisos marcados: {estado.agendados}</li>
              <li>
                Última conferência por trás:{' '}
                {ultima ? quando({ dia: diaDeHoje(ultima), hora: horaEmBrasilia(ultima) }, diaDeHoje()) : 'ainda não aconteceu (roda a cada 15 minutos com o app fechado)'}
              </li>
              {estado.problema && <li>Problema na última conferência: {estado.problema}</li>}
            </ul>
          )}
          <div className="acoes" style={{ justifyContent: 'flex-start' }}>
            {estado && !estado.avisosPermitidos && (
              <button type="button" className="btn corte-p" onClick={() => void avisos.pedirPermissao().then(setEstado)}>
                Permitir avisos
              </button>
            )}
            <button type="button" className="btn2" onClick={() => void avisos.abrirAjustes()}>
              Abrir os ajustes do app no Android
            </button>
          </div>
          <p className="suave" style={{ fontSize: 14, margin: '12px 0 0' }}>
            No Redmi, para a conferência por trás não ser cortada: nos ajustes do app, ligue Início automático e, em Economia de bateria, escolha Sem restrições.
          </p>
        </section>
      )}

      <p className="suave mono" style={{ margin: 0, fontSize: 13 }}>
        Versão do app: {VERSAO_DO_APP}
      </p>

      {temToken && (
        <p style={{ margin: 0 }}>
          <button type="button" className="btn-texto" onClick={() => void desligar()}>
            tirar o token e os dados deste celular
          </button>
        </p>
      )}
    </>
  );
}
