package com.painelfreelance.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class TelasTest {
    @Rule
    public TemporaryFolder temporaria = new TemporaryFolder();

    private static byte[] pacote(String... nomesEConteudos) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (int i = 0; i < nomesEConteudos.length; i += 2) {
                zip.putNextEntry(new ZipEntry(nomesEConteudos[i]));
                if (nomesEConteudos[i + 1] != null) zip.write(nomesEConteudos[i + 1].getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    @Test
    public void descompactaComoOTarDoWindowsGrava() throws IOException {
        File pasta = temporaria.newFolder("0.1.2");
        Telas.descompactar(
            new ByteArrayInputStream(pacote("./", null, "./assets/", null, "./index.html", "<html>", "./assets/app.js", "1", "assets\\b.css", "x")),
            pasta
        );
        assertEquals("<html>", new String(Files.readAllBytes(new File(pasta, "index.html").toPath()), StandardCharsets.UTF_8));
        assertTrue(new File(pasta, "assets/app.js").isFile());
        assertTrue(new File(pasta, "assets/b.css").isFile());
    }

    @Test
    public void recusaArquivoQueSaiDaPasta() throws IOException {
        File pasta = temporaria.newFolder("0.1.3");
        try {
            Telas.descompactar(new ByteArrayInputStream(pacote("index.html", "ok", "../fora.txt", "mal")), pasta);
            fail("deveria recusar");
        } catch (IOException esperado) {
            assertFalse(new File(pasta.getParentFile(), "fora.txt").exists());
        }
    }
}
