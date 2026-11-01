package net.agenticcorporation.pauseandnourish;

import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.io.*;

/** No logging, cookies, redirects, custom hosts, telemetry, or non-mailbox calls. */
public final class Mailbox {
    public static final class Failure extends Exception {
        public final String code;
        public final int status;
        Failure(int status, String code) { super(message(code)); this.status = status; this.code = code; }
    }
    public static String encode(String value) throws Exception { return URLEncoder.encode(value, "UTF-8"); }
    public JSONObject request(String path, String token, JSONObject body) throws Exception {
        if (!path.startsWith("/api/mailbox/")) throw new Exception("Mailbox path required.");
        HttpsURLConnection connection = (HttpsURLConnection)new URL(Contract.ORIGIN + path).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setUseCaches(false);
            if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            }
            int status = connection.getResponseCode();
            InputStream stream = status < 400 ? connection.getInputStream() : connection.getErrorStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            if (stream != null) try (InputStream in = stream) {
                byte[] chunk = new byte[2048]; int count;
                while ((count = in.read(chunk)) != -1) {
                    if (buffer.size() + count > 65536) throw new Exception("Mailbox response is too large.");
                    buffer.write(chunk, 0, count);
                }
            }
            JSONObject result;
            try { result = new JSONObject(buffer.toString("UTF-8")); }
            catch (Exception e) { throw new Failure(status, status == 404 ? "mailbox_unavailable" : "invalid_response"); }
            if (status < 200 || status >= 300)
                throw new Failure(status, result.optString("error", "server_error"));
            return result;
        } finally { connection.disconnect(); }
    }
    public static String message(String code) {
        switch (code) {
            case "pairing_not_found": return "Pairing not found. Start a new one in the web app.";
            case "invalid_exchange_code": return "The pairing code is incorrect. Check it and try again.";
            case "pairing_not_approved": return "Waiting for approval in the web app.";
            case "pairing_expired": return "Pairing expired — start a new one in the web app.";
            case "pairing_mismatch": return "Pairing details don't match. Copy them again.";
            case "unknown_token": return "Connection not recognized. Saved connection is retained; check the web app.";
            case "token_revoked": return "Connection revoked in the web app. Start a new pairing when ready.";
            case "token_expired": return "Connection expired. Renewal is needed; saved connection is retained.";
            case "missing_scope": return "This connection is missing a required permission.";
            case "no_credential": return "No connection credential is available. Complete pairing first.";
            case "mailbox_unavailable": return "Spark's mailbox is not available yet. Try again after it is deployed.";
            default: return "Mailbox could not complete the request. Saved connection is retained.";
        }
    }
}
