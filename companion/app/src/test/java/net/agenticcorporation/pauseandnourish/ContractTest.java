package net.agenticcorporation.pauseandnourish;

import org.junit.Test;
import org.json.*;
import java.time.Instant;
import static org.junit.Assert.*;

public class ContractTest {
    private void refuses(Throwing action) throws Exception {
        try { action.run(); fail("Expected rejection"); }
        catch (AssertionError e) { throw e; }
        catch (Exception expected) {}
    }
    interface Throwing { void run() throws Exception; }
    @Test public void deepLinkDecodesExactly() throws Exception {
        JSONObject p = Contract.parse("pauseandnourish://pair?v=1&kind=" + Contract.KIND +
            "&pairingId=id%2F1&secret=s%2B%26%3D&code=01+02");
        assertEquals("id/1", p.getString("pairingId"));
        assertEquals("s+&=", p.getString("secret")); assertEquals("01 02", p.getString("code"));
    }
    @Test public void textAndJsonCarriersAgree() throws Exception {
        JSONObject a = Contract.parse("Pause & Nourish pairing\nPairing ID: abc\nSecret: xyz\nCode: 0123");
        JSONObject b = Contract.parse("{\"v\":1,\"kind\":\"" + Contract.KIND +
            "\",\"pairingId\":\"abc\",\"secret\":\"xyz\",\"code\":\"0123\"}");
        assertEquals(a.toString(), b.toString());
    }
    @Test public void missingFieldsWrongHostAndForeignKindFail() throws Exception {
        refuses(() -> Contract.parse("pauseandnourish://pair?pairingId=a&secret=b"));
        refuses(() -> Contract.parse("pauseandnourish://evil?pairingId=a&secret=b&code=c"));
        refuses(() -> Contract.parse("pauseandnourish://pair?kind=foreign&pairingId=a&secret=b&code=c"));
        refuses(() -> Contract.parse("{\"kind\":\"foreign\",\"pairingId\":\"a\",\"secret\":\"b\",\"code\":\"c\"}"));
        refuses(() -> Contract.parse("{\"pairingId\":12,\"secret\":\"b\",\"code\":\"c\"}"));
        refuses(() -> Contract.parse("{\"pairingId\":\"a\",\"secret\":\"\",\"code\":\"c\"}"));
    }
    @Test public void duplicateQueryUsesFirstLikeReferenceParser() throws Exception {
        assertEquals("first", Contract.parse("pauseandnourish://pair?pairingId=first&pairingId=second&secret=b&code=c")
            .getString("pairingId"));
    }
    @Test public void fiveKnownEventTypesAcceptSmallScalars() throws Exception {
        for (String type : new String[]{"session.armed","session.stopped","cue.requested","cue.played","moment.answered"}) {
            JSONObject payload = new JSONObject().put("text","hello").put("n",3).put("yes",true).put("none",JSONObject.NULL);
            assertEquals(type, Contract.event(type, payload).getString("type"));
        }
    }
    @Test public void nestedObjectsArraysAndUnsupportedTypesFail() throws Exception {
        refuses(() -> Contract.event("cue.played", new JSONObject().put("blob", new JSONObject())));
        refuses(() -> Contract.event("cue.played", new JSONObject().put("blob", new JSONArray())));
        refuses(() -> Contract.event("audio.upload", new JSONObject()));
    }
    @Test public void keyAndStringLimitsAreExact() throws Exception {
        JSONObject payload = new JSONObject();
        for (int i=0;i<8;i++) payload.put("k"+i,i);
        Contract.event("cue.played", payload);
        payload.put("k8",8); refuses(() -> Contract.event("cue.played", payload));
        Contract.event("cue.played",new JSONObject().put("text","a".repeat(64)));
        refuses(() -> Contract.event("cue.played",new JSONObject().put("text","a".repeat(65))));
    }
    @Test public void wholeEventUsesUtf8ByteLimitNotCharacterCount() throws Exception {
        JSONObject payload = new JSONObject().put("one","€".repeat(64)).put("two","€".repeat(64)).put("three","€".repeat(64));
        refuses(() -> Contract.event("cue.played",payload));
        JSONObject hugeKey = new JSONObject().put("a".repeat(500),true);
        refuses(() -> Contract.event("cue.played",hugeKey));
    }
    @Test public void badTimestampsAndMalformedPayloadFail() throws Exception {
        refuses(() -> Contract.validate(new JSONObject().put("type","cue.played").put("at","yesterday").put("payload",new JSONObject())));
        refuses(() -> Contract.validate(new JSONObject().put("type","cue.played").put("at",Instant.now().toString()).put("payload",new JSONArray())));
    }
    private JSONObject response() throws Exception {
        return new JSONObject().put("rawToken","pn_comp_test_fixture_only").put("credential",new JSONObject()
            .put("id","identity").put("scopes",new JSONArray().put("session:arm").put("event:push").put("status:read"))
            .put("pairedAt","2026-10-31T00:00:00Z").put("expiresAt","2099-01-01T00:00:00Z"));
    }
    @Test public void renewalMustKeepIdentityAndExactScopes() throws Exception {
        assertEquals("pn_comp_test_fixture_only", Contract.credential(response(),"identity").getString("token"));
        refuses(() -> Contract.credential(response(),"another-identity"));
        JSONObject wrong = response();
        wrong.getJSONObject("credential").getJSONArray("scopes").put("microphone:read");
        refuses(() -> Contract.credential(wrong,"identity"));
    }
    @Test public void invalidTokensAndExpiredMetadataFail() throws Exception {
        JSONObject wrong = response().put("rawToken","not-a-token");
        refuses(() -> Contract.credential(wrong,null));
        JSONObject expired = response();
        expired.getJSONObject("credential").put("expiresAt","2000-01-01T00:00:00Z");
        refuses(() -> Contract.credential(expired,null));
    }
}
