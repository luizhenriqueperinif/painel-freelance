import { useCallback, useEffect, useRef, useState } from 'react';
import { diaDeHoje, horaEmBrasilia } from '../../src/dominio/datas.ts';
import { TEMAS, type Tema } from '../../src/dominio/tipos.ts';
import { api } from './api.ts';
import { pedirAtualizacao } from './componentes.tsx';
import { LINK_DO_APK, procurarVersaoNova } from './atualizacao.ts';
import { lerConfiguracao, noCelular } from './celular.ts';
import { SEM_COPIA, useDadosDe } from './conexao.ts';
import { quando } from './formato.ts';
import { PaginaAjustes } from './paginas/Ajustes.tsx';
import { PaginaHoje } from './paginas/Hoje.tsx';
import { PaginaFrentes } from './paginas/Frentes.tsx';
import { PaginaRepositorios } from './paginas/Repositorios.tsx';
import { PaginaTarefas } from './paginas/Tarefas.tsx';

export type NomeDaPagina = 'hoje' | 'frentes' | 'repositorios' | 'tarefas' | 'ajustes';

// As pastas de código só existem no PC; os ajustes (token e avisos) só existem no celular.
const PAGINAS: { nome: NomeDaPagina; rotulo: string }[] = [
  { nome: 'hoje', rotulo: 'Hoje' },
  { nome: 'frentes', rotulo: 'Frentes' },
  ...(noCelular ? [] : [{ nome: 'repositorios' as const, rotulo: 'Repositórios' }]),
  { nome: 'tarefas', rotulo: 'Tarefas' },
];
const PAGINAS_ESCONDIDAS: NomeDaPagina[] = noCelular ? ['ajustes'] : [];

const COR_DO_TEMA: Record<Tema, string> = {
  coral: '#ff5a4e',
  azul: '#3d8bff',
  esmeralda: '#1fd18a',
  ciano: '#2fe6ff',
  'azul-claro': '#6fb6ff',
};

const NOME_DO_TEMA: Record<Tema, string> = {
  coral: 'Coral e verde-água',
  azul: 'Azul e azul-gelo',
  esmeralda: 'Esmeralda e âmbar',
  ciano: 'Ciano',
  'azul-claro': 'Azul-claro',
};

export interface Rota {
  pagina: NomeDaPagina;
  parametros: URLSearchParams;
}

function lerRota(): Rota {
  const [caminho = '', busca = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const conhecida = PAGINAS.some((p) => p.nome === caminho) || PAGINAS_ESCONDIDAS.includes(caminho as NomeDaPagina);
  const pagina = conhecida ? (caminho as NomeDaPagina) : 'hoje';
  return { pagina, parametros: new URLSearchParams(busca) };
}

export function irPara(pagina: NomeDaPagina, parametros?: Record<string, string>) {
  const busca = parametros ? `?${new URLSearchParams(parametros).toString()}` : '';
  window.location.hash = `#/${pagina}${busca}`;
}

function aplicarTema(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  try {
    localStorage.setItem('tema', tema);
  } catch {
    /* sem armazenamento local: o servidor guarda o tema */
  }
}

export function Topo({ titulo, sub }: { titulo: string; sub: string }) {
  const rota = lerRota();
  const [tema, setTema] = useState<Tema>((document.documentElement.dataset.tema as Tema) ?? 'coral');

  const escolher = (novo: Tema) => {
    setTema(novo);
    aplicarTema(novo);
    api.definirTema(novo).catch(() => undefined);
  };

  return (
    <header className="topo">
      <div>
        <p className="topo-sub mono">{sub}</p>
        <h1 className="topo-titulo">
          {titulo}
          {rota.pagina === 'hoje' && <span> LH</span>}
        </h1>
      </div>
      <nav className="menu" aria-label="Menu principal">
        {PAGINAS.map((p) => (
          <a key={p.nome} className="corte-p" href={`#/${p.nome}`} aria-current={rota.pagina === p.nome ? 'page' : undefined}>
            {p.rotulo}
          </a>
        ))}
      </nav>
      <div className="temas" role="group" aria-label="Tema de cores">
        {TEMAS.map((t) => (
          <button
            key={t}
            type="button"
            className="tema"
            style={{ background: COR_DO_TEMA[t] }}
            aria-pressed={tema === t}
            aria-label={`Tema ${NOME_DO_TEMA[t]}`}
            title={NOME_DO_TEMA[t]}
            onClick={() => escolher(t)}
          />
        ))}
      </div>
      <button type="button" className="btn-texto" onClick={pedirAtualizacao}>
        atualizar
      </button>
      {noCelular && (
        <a className="btn-texto" href="#/ajustes" aria-current={rota.pagina === 'ajustes' ? 'page' : undefined}>
          ajustes
        </a>
      )}
    </header>
  );
}

const PAUSA_ENTRE_TENTATIVAS_MS = 12_000;

/** Avisa que os dados na tela são uma leitura antiga e procura a conexão de novo, sozinho. */
function AvisoSemConexao() {
  const dadosDe = useDadosDe();
  const semConexao = dadosDe !== null;
  const estavaSemConexao = useRef(false);

  useEffect(() => {
    // A conexão voltou: a tela aberta busca os dados de agora.
    if (estavaSemConexao.current && !semConexao) pedirAtualizacao();
    estavaSemConexao.current = semConexao;
    if (!semConexao) return;
    // Um pedido leve basta para o servidor tentar o GitHub outra vez e contar como foi.
    const repetir = window.setInterval(() => void api.tema().catch(() => undefined), PAUSA_ENTRE_TENTATIVAS_MS);
    return () => window.clearInterval(repetir);
  }, [semConexao]);

  if (dadosDe === null) return null;
  const lidos = dadosDe === SEM_COPIA ? null : new Date(dadosDe);
  return (
    <p className="aviso" role="status">
      Sem conexão com o GitHub.{' '}
      {lidos && `Mostrando os dados de ${quando({ dia: diaDeHoje(lidos), hora: horaEmBrasilia(lidos) }, diaDeHoje())}. `}
      Não dá para gravar até a conexão voltar; o painel tenta de novo sozinho.
    </p>
  );
}

/** No celular: avisa quando há versão nova do app para baixar. */
function AvisoDeVersaoNova() {
  const [versao, setVersao] = useState<string | null>(null);
  useEffect(() => {
    if (noCelular) void procurarVersaoNova().then(setVersao);
  }, []);
  if (!versao) return null;
  return (
    <p className="aviso" role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ flex: 1 }}>Versão nova do app: {versao}. Baixe e toque em Instalar; o token e os dados continuam.</span>
      <a className="btn corte-p" href={LINK_DO_APK} target="_blank" rel="noreferrer">
        Baixar
      </a>
    </p>
  );
}

export function App() {
  const [rota, setRota] = useState<Rota>(lerRota);
  // No celular, sem repositório e token guardados, a primeira tela é a de ajustes.
  const [configurado, setConfigurado] = useState<boolean | null>(noCelular ? null : true);

  useEffect(() => {
    if (noCelular) void lerConfiguracao().then((atual) => setConfigurado(atual !== null)).catch(() => setConfigurado(false));
  }, []);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem('tema') as Tema | null;
      if (salvo && TEMAS.includes(salvo)) aplicarTema(salvo);
    } catch {
      /* ignora */
    }
    const mudou = () => setRota(lerRota());
    window.addEventListener('hashchange', mudou);
    return () => window.removeEventListener('hashchange', mudou);
  }, []);

  useEffect(() => {
    if (configurado) api.tema().then(({ tema }) => aplicarTema(tema)).catch(() => undefined);
  }, [configurado]);

  const pagina = useCallback(() => {
    if (configurado === false) return <PaginaAjustes primeiraVez aoConfigurar={() => setConfigurado(true)} />;
    switch (rota.pagina) {
      case 'ajustes':
        return <PaginaAjustes />;
      case 'frentes':
        return <PaginaFrentes />;
      case 'repositorios':
        return <PaginaRepositorios />;
      case 'tarefas':
        return <PaginaTarefas parametros={rota.parametros} />;
      default:
        return <PaginaHoje />;
    }
  }, [rota, configurado]);

  if (configurado === null) return <div className="pagina" />;
  return (
    <div className="pagina">
      <AvisoDeVersaoNova />
      {configurado && <AvisoSemConexao />}
      {pagina()}
    </div>
  );
}
