package com.painelfreelance.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Atualiza as telas do app (HTML, JS e CSS) sem instalar APK. Cada Release traz um telas.zip;
 * o app baixa, descompacta numa pasta própria e passa a abrir dali (o Capacitor guarda essa pasta
 * e a esquece sozinho quando um APK novo é instalado). A parte Android (avisos, token) só muda com APK:
 * por isso o pacote diz qual parte Android precisa e, se o app for mais velho, não é usado.
 *
 * Se as telas novas não abrirem (não confirmam em 30 segundos ou até a próxima abertura),
 * o app volta para as anteriores e não tenta mais aquela versão.
 */
final class Telas {
    /** Só aceita pacotes das Releases do painel. */
    static final String ORIGEM = "https://github.com/luizhenriqueperinif/painel-freelance/releases/download/";
    private static final long TAMANHO_MAXIMO = 20L * 1024 * 1024;
    private static final String PREFS_DO_CAPACITOR = com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME;
    private static final String CAMINHO = com.getcapacitor.plugin.WebView.CAP_SERVER_PATH;

    static final String CONFIRMADAS = "telasConfirmadas";
    static final String ANTERIORES = "telasAnteriores";
    static final String RECUSADA = "telasRecusada";
    static final String DO_APK = "telasDoApk";

    private Telas() {}

    static File raiz(Context contexto) {
        return new File(contexto.getFilesDir(), "telas");
    }

    static boolean recusada(Context contexto, String versao) {
        return versao.equals(Guardados.de(contexto).getString(RECUSADA, null));
    }

    /**
     * Baixa e descompacta o pacote. Devolve a pasta pronta, ou null se as telas pedem uma parte
     * Android mais nova que a deste APK (aí só um APK novo resolve).
     */
    static File baixar(Context contexto, String endereco, String versao) throws IOException {
        if (!endereco.startsWith(ORIGEM)) throw new IOException("o pacote não vem das Releases do painel");
        if (!versao.matches("[0-9]+(\\.[0-9]+)*")) throw new IOException("versão estranha: " + versao);
        File pasta = new File(raiz(contexto), versao);
        apagar(pasta);
        if (!pasta.mkdirs()) throw new IOException("não deu para criar a pasta das telas");
        try {
            descompactar(endereco, pasta);
            JSONObject sobre = new JSONObject(lerTexto(new File(pasta, "versao.json")));
            if (!new File(pasta, "index.html").isFile()) throw new IOException("o pacote não tem index.html");
            if (!versao.equals(sobre.getString("versao"))) throw new IOException("o pacote é de outra versão");
            if (sobre.getInt("parteAndroid") > BuildConfig.PARTE_ANDROID) {
                apagar(pasta);
                return null;
            }
            return pasta;
        } catch (IOException | JSONException | RuntimeException erro) {
            apagar(pasta);
            throw erro instanceof IOException ? (IOException) erro : new IOException("pacote das telas com problema", erro);
        }
    }

    private static void descompactar(String endereco, File pasta) throws IOException {
        HttpURLConnection conexao = (HttpURLConnection) new URL(endereco).openConnection();
        conexao.setConnectTimeout(15_000);
        conexao.setReadTimeout(30_000);
        try {
            if (conexao.getResponseCode() != 200) throw new IOException("o GitHub respondeu " + conexao.getResponseCode());
            try (InputStream entrada = conexao.getInputStream()) {
                descompactar(entrada, pasta);
            }
        } finally {
            conexao.disconnect();
        }
    }

    /** Descompacta o pacote na pasta, recusando arquivos que tentem sair dela. */
    static void descompactar(InputStream pacote, File pasta) throws IOException {
        String base = pasta.getCanonicalPath() + File.separator;
        long total = 0;
        byte[] pedaco = new byte[16 * 1024];
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(pacote))) {
            for (ZipEntry entrada; (entrada = zip.getNextEntry()) != null; ) {
                String nome = entrada.getName().replace('\\', '/');
                while (nome.startsWith("./")) nome = nome.substring(2);
                if (entrada.isDirectory() || nome.isEmpty() || nome.endsWith("/")) continue;
                File destino = new File(pasta, nome);
                if (!destino.getCanonicalPath().startsWith(base)) throw new IOException("arquivo fora da pasta no pacote");
                File pai = destino.getParentFile();
                if (pai != null && !pai.isDirectory() && !pai.mkdirs()) throw new IOException("não deu para criar " + pai);
                try (OutputStream saida = new FileOutputStream(destino)) {
                    for (int lidos; (lidos = zip.read(pedaco)) > 0; ) {
                        total += lidos;
                        if (total > TAMANHO_MAXIMO) throw new IOException("pacote grande demais");
                        saida.write(pedaco, 0, lidos);
                    }
                }
            }
        }
    }

    /** Passa a abrir as telas da pasta (já baixada) e espera a confirmação de que elas funcionam. */
    static void usar(Context contexto, com.getcapacitor.Bridge ponte, File pasta) {
        SharedPreferences capacitor = contexto.getSharedPreferences(PREFS_DO_CAPACITOR, Context.MODE_PRIVATE);
        String atual = capacitor.getString(CAMINHO, "");
        Guardados.de(contexto)
            .edit()
            .putString(ANTERIORES, atual == null ? "" : atual)
            .putBoolean(CONFIRMADAS, false)
            .putInt(DO_APK, BuildConfig.VERSION_CODE)
            .commit();
        capacitor.edit().putString(CAMINHO, pasta.getAbsolutePath()).commit();
        ponte.setServerBasePath(pasta.getAbsolutePath());
    }

    /** As telas abriram: ficam valendo, e as pastas de outras versões são apagadas. */
    static void confirmar(Context contexto) {
        Guardados.de(contexto).edit().putBoolean(CONFIRMADAS, true).apply();
        String atual = contexto.getSharedPreferences(PREFS_DO_CAPACITOR, Context.MODE_PRIVATE).getString(CAMINHO, "");
        File[] pastas = raiz(contexto).listFiles();
        if (pastas == null) return;
        for (File pasta : pastas) {
            if (!pasta.getAbsolutePath().equals(atual)) apagar(pasta);
        }
    }

    /**
     * Se as últimas telas trocadas não confirmaram, volta para as anteriores e não tenta mais
     * aquela versão. Devolve a pasta para onde voltou ("" = as telas do próprio APK), ou null se
     * não havia nada para desfazer.
     */
    static String desfazerSeNaoConfirmou(Context contexto) {
        SharedPreferences guardados = Guardados.de(contexto);
        if (guardados.getBoolean(CONFIRMADAS, true)) return null;
        // Um APK novo entrou no meio: o Capacitor já volta às telas dele.
        if (guardados.getInt(DO_APK, -1) != BuildConfig.VERSION_CODE) {
            guardados.edit().putBoolean(CONFIRMADAS, true).apply();
            return null;
        }
        SharedPreferences capacitor = contexto.getSharedPreferences(PREFS_DO_CAPACITOR, Context.MODE_PRIVATE);
        String falhou = capacitor.getString(CAMINHO, "");
        String anterior = guardados.getString(ANTERIORES, "");
        if (anterior == null || anterior.equals(falhou) || !new File(anterior).isDirectory()) anterior = "";
        capacitor.edit().putString(CAMINHO, anterior).commit();
        guardados.edit().putBoolean(CONFIRMADAS, true).putString(RECUSADA, falhou == null ? "" : new File(falhou).getName()).commit();
        return anterior;
    }

    private static String lerTexto(File arquivo) throws IOException {
        try (InputStream entrada = new FileInputStream(arquivo)) {
            ByteArrayOutputStream juntos = new ByteArrayOutputStream();
            byte[] pedaco = new byte[4096];
            for (int lidos; (lidos = entrada.read(pedaco)) > 0; ) juntos.write(pedaco, 0, lidos);
            return new String(juntos.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    static void apagar(File arquivo) {
        File[] dentro = arquivo.listFiles();
        if (dentro != null) for (File item : dentro) apagar(item);
        //noinspection ResultOfMethodCallIgnored
        arquivo.delete();
    }
}
