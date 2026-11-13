package com.painelfreelance.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Com o app fechado, confere o arquivo de dados no GitHub a cada 15 minutos (o menor intervalo
 * que o Android aceita) e refaz os avisos. É assim que uma tarefa criada no PC ou pelo Claude
 * avisa no celular. Só lê; gravar é sempre pelo app aberto.
 */
public class ConferenciaWorker extends Worker {
    private static final String NOME = "conferir-painel";

    public ConferenciaWorker(@NonNull Context contexto, @NonNull WorkerParameters parametros) {
        super(contexto, parametros);
    }

    static void agendar(Context contexto) {
        PeriodicWorkRequest pedido = new PeriodicWorkRequest.Builder(ConferenciaWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build();
        WorkManager.getInstance(contexto).enqueueUniquePeriodicWork(NOME, ExistingPeriodicWorkPolicy.KEEP, pedido);
    }

    static void parar(Context contexto) {
        WorkManager.getInstance(contexto).cancelUniqueWork(NOME);
    }

    private static String ler(InputStream entrada) throws IOException {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        byte[] pedaco = new byte[16 * 1024];
        int lidos;
        while ((lidos = entrada.read(pedaco)) != -1) saida.write(pedaco, 0, lidos);
        return saida.toString("UTF-8");
    }

    @NonNull
    @Override
    public Result doWork() {
        Context contexto = getApplicationContext();
        SharedPreferences guardados = Guardados.de(contexto);
        String repositorio = guardados.getString(Guardados.REPOSITORIO, null);
        String token = guardados.getString(Guardados.TOKEN, null);
        if (repositorio == null || token == null) return Result.success();

        HttpURLConnection conexao = null;
        try {
            conexao = (HttpURLConnection) new URL("https://api.github.com/repos/" + repositorio + "/contents/painel.json").openConnection();
            conexao.setConnectTimeout(15_000);
            conexao.setReadTimeout(20_000);
            conexao.setUseCaches(false);
            conexao.setRequestProperty("Accept", "application/vnd.github+json");
            conexao.setRequestProperty("Authorization", "Bearer " + token);
            conexao.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            conexao.setRequestProperty("User-Agent", "painel-freelance");
            String etiqueta = guardados.getString(Guardados.ETIQUETA, null);
            if (etiqueta != null && guardados.contains(Guardados.TEXTO)) conexao.setRequestProperty("If-None-Match", etiqueta);

            int status = conexao.getResponseCode();
            long agora = System.currentTimeMillis();
            if (status == 304) {
                guardados.edit().putLong(Guardados.ULTIMA_CONFERENCIA, agora).remove(Guardados.ULTIMO_PROBLEMA).apply();
                return Result.success();
            }
            if (status != 200) {
                anotarProblema(guardados, status == 401 ? "o GitHub recusou o token (vencido ou revogado)" : "o GitHub respondeu com erro " + status);
                return Result.success();
            }
            JSONObject corpo = new JSONObject(ler(conexao.getInputStream()));
            String conteudo = corpo.optString("content", "");
            // Acima de 1 MB o conteúdo não vem junto; o app aberto lê pelo outro caminho.
            if (conteudo.isEmpty()) return Result.success();
            String texto = new String(Base64.decode(conteudo, Base64.DEFAULT), StandardCharsets.UTF_8);
            Guardados.gravarCopia(contexto, texto, corpo.getString("sha"), agora);
            guardados.edit()
                .putString(Guardados.ETIQUETA, conexao.getHeaderField("ETag"))
                .putLong(Guardados.ULTIMA_CONFERENCIA, agora)
                .remove(Guardados.ULTIMO_PROBLEMA)
                .apply();
            Avisos.agendar(contexto, texto);
            return Result.success();
        } catch (IOException erro) {
            anotarProblema(guardados, "sem conexão com o GitHub");
            return Result.success();
        } catch (JSONException | IllegalArgumentException erro) {
            anotarProblema(guardados, "o arquivo de dados veio num formato que não deu para ler");
            return Result.success();
        } finally {
            if (conexao != null) conexao.disconnect();
        }
    }

    private static void anotarProblema(SharedPreferences guardados, String problema) {
        guardados.edit().putString(Guardados.ULTIMO_PROBLEMA, problema).apply();
    }
}
