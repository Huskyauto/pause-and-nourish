package net.agenticcorporation.pauseandnourish;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** All persistent bridge state is authenticated encryption, including outbox and token.
 * AtomicFile preserves the previous generation if saving the new generation fails.
 * A corrupt vault never causes automatic deletion or a new device identity.
 */
public final class Vault {
    private static final String ALIAS = "pause-and-nourish.bridge.v1";
    private static Vault singleton;
    private final AtomicFile file;
    private final SecretKey key;
    private JSONObject data;
    private Vault(Context context) throws Exception {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "bridge.enc"));
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            // Never replace a missing key while an encrypted identity exists.
            if (file.getBaseFile().exists()) throw new Exception("Stored connection key is unavailable.");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        key = (SecretKey)store.getKey(ALIAS, null);
        if (file.getBaseFile().exists() || new File(file.getBaseFile() + ".bak").exists()) {
            byte[] bytes = file.readFully();
            if (bytes.length < 29) throw new Exception("Stored connection cannot be read.");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Arrays.copyOfRange(bytes, 0, 12)));
            data = new JSONObject(new String(cipher.doFinal(Arrays.copyOfRange(bytes, 12, bytes.length)),
                StandardCharsets.UTF_8));
        } else data = new JSONObject();
    }
    public static synchronized Vault get(Context context) throws Exception {
        if (singleton == null) singleton = new Vault(context.getApplicationContext());
        return singleton;
    }
    public synchronized JSONObject snapshot() throws Exception { return new JSONObject(data.toString()); }
    public synchronized void save(JSONObject next) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] ciphertext = cipher.doFinal(next.toString().getBytes(StandardCharsets.UTF_8));
        FileOutputStream out = null;
        try {
            out = file.startWrite();
            out.write(cipher.getIV());
            out.write(ciphertext);
            file.finishWrite(out);
            data = new JSONObject(next.toString());
        } catch (Exception e) {
            if (out != null) file.failWrite(out);
            throw e;
        }
    }
    public synchronized void put(String key, Object value) throws Exception {
        JSONObject next = snapshot();
        next.put(key, value);
        save(next);
    }
}
