package com.painelfreelance.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * O que o app guarda no próprio celular: o repositório de dados, o token e a última leitura
 * do arquivo de dados (a "cópia do aparelho"). Fica na área privada do app; nenhum outro app
 * enxerga, e o backup do Android está desligado no manifesto para o token não sair daqui.
 */
final class Guardados {
    static final String REPOSITORIO = "repositorio";
    static final String TOKEN = "token";
    /** A última leitura do painel.json: texto, versão (sha do GitHub) e quando foi lida (ms). */
    static final String TEXTO = "texto";
    static final String VERSAO = "versao";
    static final String LIDA_EM = "lidaEm";
    /** Etiqueta da última leitura feita por trás, para perguntar ao GitHub "mudou?" sem baixar tudo. */
    static final String ETIQUETA = "etiqueta";
    /** Os códigos dos avisos agendados, para cancelar os que deixaram de valer. */
    static final String AGENDADOS = "agendados";
    static final String ULTIMA_CONFERENCIA = "ultimaConferencia";
    static final String ULTIMO_PROBLEMA = "ultimoProblema";

    private Guardados() {}

    static SharedPreferences de(Context contexto) {
        return contexto.getApplicationContext().getSharedPreferences("painel", Context.MODE_PRIVATE);
    }

    /** Guarda uma leitura nova do arquivo de dados. */
    static void gravarCopia(Context contexto, String texto, String versao, long lidaEm) {
        de(contexto).edit().putString(TEXTO, texto).putString(VERSAO, versao).putLong(LIDA_EM, lidaEm).apply();
    }

    /** Apaga a leitura guardada: ao trocar de repositório, os dados do antigo não podem aparecer. */
    static void esquecerCopia(Context contexto) {
        de(contexto).edit().remove(TEXTO).remove(VERSAO).remove(LIDA_EM).remove(ETIQUETA).apply();
    }
}
