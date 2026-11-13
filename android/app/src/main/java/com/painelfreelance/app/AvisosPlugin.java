package com.painelfreelance.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Collections;

/**
 * A ponte entre as telas (web/src/celular.ts) e o lado Android: guarda o repositório e o token,
 * guarda a última leitura do arquivo de dados e, a cada leitura nova, refaz os avisos.
 */
@CapacitorPlugin(name = "Avisos", permissions = { @Permission(alias = "avisos", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class AvisosPlugin extends Plugin {

    private Context contexto() {
        return getContext().getApplicationContext();
    }

    @PluginMethod
    public void configuracao(PluginCall call) {
        SharedPreferences guardados = Guardados.de(contexto());
        JSObject resposta = new JSObject();
        String repositorio = guardados.getString(Guardados.REPOSITORIO, null);
        String token = guardados.getString(Guardados.TOKEN, null);
        if (repositorio != null && token != null) {
            resposta.put("repositorio", repositorio);
            resposta.put("token", token);
        }
        call.resolve(resposta);
    }

    @PluginMethod
    public void configurar(PluginCall call) {
        String repositorio = call.getString("repositorio");
        String token = call.getString("token");
        if (repositorio == null || repositorio.trim().isEmpty() || token == null || token.trim().isEmpty()) {
            call.reject("Informe o repositório e o token.");
            return;
        }
        SharedPreferences guardados = Guardados.de(contexto());
        if (!repositorio.trim().equals(guardados.getString(Guardados.REPOSITORIO, null))) {
            Guardados.esquecerCopia(contexto());
            Avisos.agendar(contexto(), null);
        }
        guardados.edit().putString(Guardados.REPOSITORIO, repositorio.trim()).putString(Guardados.TOKEN, token.trim()).apply();
        ConferenciaWorker.agendar(contexto());
        call.resolve();
    }

    @PluginMethod
    public void esquecer(PluginCall call) {
        ConferenciaWorker.parar(contexto());
        Avisos.agendar(contexto(), null);
        Guardados.de(contexto()).edit().clear().apply();
        call.resolve();
    }

    @PluginMethod
    public void lerCopia(PluginCall call) {
        SharedPreferences guardados = Guardados.de(contexto());
        JSObject resposta = new JSObject();
        String texto = guardados.getString(Guardados.TEXTO, null);
        String versao = guardados.getString(Guardados.VERSAO, null);
        if (texto != null && versao != null) {
            resposta.put("texto", texto);
            resposta.put("versao", versao);
            resposta.put("lidaEm", (double) guardados.getLong(Guardados.LIDA_EM, 0));
        }
        call.resolve(resposta);
    }

    @PluginMethod
    public void gravarCopia(PluginCall call) {
        String texto = call.getString("texto");
        String versao = call.getString("versao");
        // A hora vem em milissegundos, grande demais para int: optDouble aceita qualquer número.
        double lidaEm = call.getData().optDouble("lidaEm", Double.NaN);
        if (texto == null || versao == null || Double.isNaN(lidaEm)) {
            call.reject("Cópia incompleta.");
            return;
        }
        Guardados.gravarCopia(contexto(), texto, versao, (long) lidaEm);
        Avisos.agendar(contexto(), texto);
        call.resolve();
    }

    @PluginMethod
    public void estado(PluginCall call) {
        SharedPreferences guardados = Guardados.de(contexto());
        JSObject resposta = new JSObject();
        resposta.put("avisosPermitidos", Avisos.podeNotificar(contexto()));
        resposta.put("naHoraCerta", Avisos.podeAvisarNaHoraCerta(contexto()));
        resposta.put("agendados", guardados.getStringSet(Guardados.AGENDADOS, Collections.emptySet()).size());
        if (guardados.contains(Guardados.ULTIMA_CONFERENCIA)) resposta.put("ultimaConferencia", (double) guardados.getLong(Guardados.ULTIMA_CONFERENCIA, 0));
        String problema = guardados.getString(Guardados.ULTIMO_PROBLEMA, null);
        if (problema != null) resposta.put("problema", problema);
        call.resolve(resposta);
    }

    @PluginMethod
    public void pedirPermissao(PluginCall call) {
        Avisos.criarCanal(contexto());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("avisos") != PermissionState.GRANTED) {
            requestPermissionForAlias("avisos", call, "depoisDaPermissao");
            return;
        }
        estado(call);
    }

    @PermissionCallback
    private void depoisDaPermissao(PluginCall call) {
        estado(call);
    }

    /** Abre a página do app nas configurações do Android: no Redmi é lá que se libera o início automático e a bateria. */
    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
