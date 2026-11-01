package net.agenticcorporation.pauseandnourish;

import org.json.JSONArray;
import org.json.JSONObject;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.regex.*;

/** Pure wire-contract rules. No Android dependency; exercised on the JVM. */
public final class Contract {
    private Contract() {}
    public static final String ORIGIN = "https://pause-and-nourish.vercel.app";
    public static final String KIND = "pause-and-nourish-pairing";
    public static final Set<String> SCOPES =
        Collections.unmodifiableSet(new HashSet<>(Arrays.asList("session:arm", "event:push", "status:read")));
    private static final Set<String> TYPES = new HashSet<>(Arrays.asList(
        "session.armed", "session.stopped", "cue.requested", "cue.played", "moment.answered"));

    public static JSONObject fields(String id, String secret, String code) throws Exception {
        if (id == null || id.isEmpty() || secret == null || secret.isEmpty()
                || code == null || code.isEmpty()) {
            throw new Exception("That pairing link isn't complete.");
        }
        if (id.length() > 512 || secret.length() > 4096 || code.length() > 512) {
            throw new Exception("That pairing link is too long.");
        }
        return new JSONObject().put("pairingId", id).put("secret", secret).put("code", code);
    }

    public static JSONObject parse(String input) throws Exception {
        String text = input.trim();
        if (text.startsWith("pauseandnourish://")) {
            URI uri = new URI(text);
            if (!"pair".equals(uri.getHost())) throw new Exception("That isn't a pairing link.");
            Map<String, String> params = new LinkedHashMap<>();
            String query = uri.getRawQuery();
            if (query != null) for (String part : query.split("&")) {
                String[] p = part.split("=", 2);
                String key = URLDecoder.decode(p[0], "UTF-8");
                // URLSearchParams.get returns the first occurrence.
                if (!params.containsKey(key)) params.put(key,
                    URLDecoder.decode(p.length > 1 ? p[1] : "", "UTF-8"));
            }
            checkKind(params.get("kind"));
            return fields(params.get("pairingId"), params.get("secret"), params.get("code"));
        }
        if (text.startsWith("{")) {
            JSONObject value = new JSONObject(text);
            if (value.has("kind")) {
                if (!(value.get("kind") instanceof String)) throw new Exception("Wrong pairing kind.");
                checkKind(value.getString("kind"));
            }
            for (String key : Arrays.asList("pairingId", "secret", "code")) {
                if (!(value.opt(key) instanceof String)) throw new Exception("That pairing link isn't complete.");
            }
            return fields(value.getString("pairingId"), value.getString("secret"), value.getString("code"));
        }
        return fields(line(text, "Pairing ID"), line(text, "Secret"), line(text, "Code"));
    }

    private static String line(String text, String label) {
        Matcher match = Pattern.compile("^" + Pattern.quote(label) + ":\\s*(.+)$",
            Pattern.MULTILINE).matcher(text);
        return match.find() ? match.group(1).trim() : null;
    }
    private static void checkKind(String kind) throws Exception {
        if (kind != null && !KIND.equals(kind)) throw new Exception("That isn't a Pause & Nourish pairing.");
    }
    public static long timestamp(String value) {
        try { return Instant.parse(value).toEpochMilli(); }
        catch (Exception e) { return 0; }
    }
    public static JSONObject event(String type, JSONObject payload) throws Exception {
        return validate(new JSONObject().put("type", type).put("at", Instant.now().toString())
            .put("payload", payload));
    }
    public static JSONObject validate(JSONObject input) throws Exception {
        if (!TYPES.contains(input.optString("type"))) throw new Exception("Unsupported event.");
        if (!(input.opt("at") instanceof String) || timestamp(input.getString("at")) == 0)
            throw new Exception("Invalid event time.");
        Object raw = input.opt("payload");
        if (!(raw instanceof JSONObject)) throw new Exception("Event payload must be a flat object.");
        JSONObject payload = (JSONObject) raw;
        if (payload.length() > 8) throw new Exception("Too many event fields.");
        Iterator<String> keys = payload.keys();
        while (keys.hasNext()) {
            Object value = payload.get(keys.next());
            boolean scalar = value == JSONObject.NULL || value instanceof String ||
                value instanceof Boolean || value instanceof Number;
            if (!scalar) throw new Exception("Event fields must be scalars.");
            if (value instanceof String && ((String)value).length() > 64)
                throw new Exception("Event text is too long.");
            if (value instanceof Number && !Double.isFinite(((Number)value).doubleValue()))
                throw new Exception("Event number must be finite.");
        }
        JSONObject clean = new JSONObject().put("type", input.getString("type"))
            .put("at", input.getString("at")).put("payload", new JSONObject(payload.toString()));
        if (clean.toString().getBytes(StandardCharsets.UTF_8).length > 512)
            throw new Exception("Event exceeds 512 bytes.");
        return clean;
    }
    public static JSONObject credential(JSONObject response, String expectedId) throws Exception {
        String token = response.getString("rawToken");
        JSONObject metadata = response.getJSONObject("credential");
        if (!token.startsWith("pn_comp_") || token.length() <= 8)
            throw new Exception("Invalid credential response.");
        String id = metadata.getString("id");
        if (id.isEmpty() || (expectedId != null && !expectedId.equals(id)))
            throw new Exception("Credential identity changed.");
        JSONArray scopes = metadata.getJSONArray("scopes");
        Set<String> actual = new HashSet<>();
        for (int i = 0; i < scopes.length(); i++) actual.add(scopes.getString(i));
        if (!actual.equals(SCOPES) || scopes.length() != 3)
            throw new Exception("Unexpected credential permissions.");
        if (timestamp(metadata.getString("pairedAt")) == 0 ||
                timestamp(metadata.getString("expiresAt")) <= System.currentTimeMillis())
            throw new Exception("Invalid credential dates.");
        return new JSONObject().put("token", token).put("credential", metadata);
    }
}
