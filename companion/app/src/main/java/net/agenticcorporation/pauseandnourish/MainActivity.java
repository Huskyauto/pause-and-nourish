package net.agenticcorporation.pauseandnourish;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.File;
import java.nio.file.*;

/** Exactly three screens. Recording is visible-activity only and stops on leaving. */
public final class MainActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LinearLayout body;
    private TextView status, feedback, recorderStatus;
    private EditText pasted, id, secret, code;
    private String page = "Status";
    private MediaRecorder recorder;
    private MediaPlayer preview;
    private AudioFocusRequest previewFocus;
    private boolean finishingRecording;
    private long nextNetwork;
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            update();
            if (SystemClock.elapsedRealtime() >= nextNetwork) {
                Bridge.tick(MainActivity.this);
                nextNetwork = SystemClock.elapsedRealtime() + (Bridge.pairingActive() ? 2000 : 5000);
            }
            handler.postDelayed(this, 700);
        }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setStatusBarColor(Color.rgb(18, 62, 54));
        getWindow().setNavigationBarColor(Color.rgb(18, 62, 54));
        show("Status");
        accept(getIntent());
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent); accept(intent);
    }
    private void accept(Intent intent) {
        Uri uri = intent.getData();
        if (uri == null) return;
        // Clear the raw carrier from our retained intent after intake; never persist it.
        intent.setData(null);
        try {
            JSONObject payload = Contract.parse(uri.toString());
            show("Pairing"); fill(payload);
        } catch (Exception e) {
            show("Pairing"); Bridge.notice = "That pairing link isn't complete or isn't for this app.";
        }
    }
    @Override protected void onResume() {
        super.onResume(); Bridge.visible = true;
        nextNetwork = 0; handler.post(refresh);
    }
    @Override protected void onPause() {
        Bridge.visible = false; handler.removeCallbacks(refresh);
        finishRecording(); stopPreview();
        super.onPause();
    }
    private int dp(int value) { return (int)(value * getResources().getDisplayMetrics().density); }
    private void show(String target) {
        finishRecording(); stopPreview(); page = target;
        status = null; feedback = null; recorderStatus = null;
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(247, 249, 242));
        root.setPadding(dp(18), dp(16), dp(18), dp(12));
        // Target 35 enforces edge-to-edge. Keep all controls outside system-bar insets.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top; bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            root.setPadding(dp(18), dp(12) + top, dp(18), dp(12) + bottom);
            return insets;
        });
        TextView heading = new TextView(this); heading.setText("Pause & Nourish");
        heading.setTextSize(25); heading.setTextColor(Color.rgb(18, 62, 54));
        heading.setTypeface(null, Typeface.BOLD); root.addView(heading);
        LinearLayout tabs = new LinearLayout(this);
        for (String tab : new String[]{"Status", "Pairing", "Your cue"}) {
            Button button = new Button(this); button.setText(tab); button.setAllCaps(false);
            button.setContentDescription("Show " + tab);
            button.setEnabled(!tab.equals(target));
            button.setOnClickListener(v -> show(tab));
            tabs.addView(button, new LinearLayout.LayoutParams(0, dp(56), 1));
        }
        root.addView(tabs);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(0, dp(12), 0, dp(20)); scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        if ("Pairing".equals(target)) pairing();
        else if ("Your cue".equals(target)) cue();
        else statusPage();
        feedback = text(""); feedback.setTextColor(Color.rgb(116, 62, 15));
        update();
    }
    private TextView text(String value) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(17);
        view.setTextColor(Color.rgb(29, 48, 40)); view.setLineSpacing(dp(3), 1);
        view.setPadding(0, dp(7), 0, dp(10)); body.addView(view); return view;
    }
    private void button(String label, Runnable action) {
        Button button = new Button(this); button.setText(label); button.setAllCaps(false);
        button.setMinHeight(dp(52));
        button.setOnClickListener(v -> action.run()); body.addView(button);
    }
    private EditText input(String label, boolean hidden) {
        text(label);
        EditText view = new EditText(this); view.setTextSize(16); view.setMinHeight(dp(50));
        view.setSaveEnabled(false); view.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        view.setInputType(InputType.TYPE_CLASS_TEXT |
            (hidden ? InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS));
        view.setContentDescription(label);
        body.addView(view); return view;
    }
    private void statusPage() {
        status = text("");
        button("Check connection", () -> { nextNetwork = 0; Bridge.tick(this); });
        button("Open web app", this::openWeb);
        button("Allow armed notifications", () -> {
            if (Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 20);
            } else {
                startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName()));
            }
        });
        button("Stop session", () -> Bridge.stopped(this, "notification"));
        text("For the demo: keep this app open while you arm in the web app. Once the armed " +
            "notification appears, turn off the screen and press headset play/pause.\n\n" +
            "Only your recorded cue plays. No microphone listening, health data, or audio uploads.");
        text("Companion 1.0.0 · Android " + Build.VERSION.RELEASE);
    }
    private void pairing() {
        text("Paste pairing");
        pasted = input("Pairing link or copied text", true);
        button("Read pasted pairing", () -> {
            try {
                JSONObject payload = Contract.parse(pasted.getText().toString());
                pasted.setText(""); fill(payload);
            } catch (Exception e) { Bridge.notice = "That pairing link isn't complete or isn't for this app."; }
        });
        id = input("Pairing ID", false);
        secret = input("Secret", true);
        code = input("Code", true);
        text("Pairing requested\n\nPermissions:\n• Arm sessions on this phone\n" +
            "• Send small status events\n• Read this connection's own status\n\n" +
            "Your approval in the web app is still required. All three pairing fields are needed.");
        button("Pair", () -> {
            if (Bridge.pairingActive()) {
                Bridge.notice = "Pairing is already waiting for your web-app approval.";
                return;
            }
            try {
                JSONObject payload = Contract.fields(id.getText().toString().trim(),
                    secret.getText().toString().trim(), code.getText().toString().trim());
                JSONObject state = Vault.get(this).snapshot();
                Runnable begin = () -> {
                    stopService(new Intent(this, CueService.class));
                    Bridge.beginNewPairing(this, payload);
                    id.setText(""); secret.setText(""); code.setText("");
                };
                if (!state.optString("token").isEmpty()) {
                    new AlertDialog.Builder(this).setTitle("Replace this connection?")
                        .setMessage("This stops the session. A successful new pairing replaces the connection " +
                            "and discards any queued status events. Your recorded cue stays on this phone.")
                        .setNegativeButton("Cancel", null).setPositiveButton("Start new pairing", (d, which) -> begin.run()).show();
                } else begin.run();
            } catch (Exception e) { Bridge.notice = "Enter the pairing ID, secret, and code shown in the web app."; }
        });
        button("Open web app to approve", this::openWeb);
    }
    private void fill(JSONObject payload) throws Exception {
        id.setText(payload.getString("pairingId"));
        secret.setText(payload.getString("secret"));
        code.setText(payload.getString("code"));
        Bridge.pairingState = "Pairing requested";
        Bridge.notice = "Review the permissions, then tap Pair.";
    }
    private void openWeb() { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(Contract.ORIGIN))); }
    private void cue() {
        text("Your cue stays on this phone");
        text("Record your own short reminder, up to 10 seconds. The microphone is used only while " +
            "this screen is visible and you are recording.");
        recorderStatus = text("");
        button("Record / re-record", () -> {
            if (recorder != null) { Bridge.notice = "Stop the current recording first."; return; }
            if (CueService.running != null) { Bridge.notice = "Stop the armed session before recording a new cue."; return; }
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 21);
            else startRecording();
        });
        button("Stop recording", this::finishRecording);
        button("Preview cue", this::playPreview);
        text("After arming, if your headset controls another audio app instead, stop that app and " +
            "preview your cue here once while armed, then test the headset button again. " +
            "Android and headset routing must be verified on your actual phone.");
    }
    private void startRecording() {
        if (!"Your cue".equals(page) || !Bridge.visible || recorder != null) return;
        stopPreview();
        File draft = new File(getFilesDir(), "cue-draft.m4a");
        try {
            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioSamplingRate(44100); recorder.setAudioEncodingBitRate(96000);
            recorder.setMaxDuration(10000); recorder.setOutputFile(draft.getAbsolutePath());
            recorder.setOnInfoListener((r, what, extra) -> {
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) finishRecording();
            });
            recorder.prepare(); recorder.start();
            Bridge.notice = "Recording now — stops automatically after 10 seconds.";
        } catch (Exception e) {
            if (recorder != null) { recorder.release(); recorder = null; }
            draft.delete(); Bridge.notice = "Microphone could not record. Check its permission and try again.";
        }
    }
    private void finishRecording() {
        if (recorder == null || finishingRecording) return;
        finishingRecording = true;
        File draft = new File(getFilesDir(), "cue-draft.m4a");
        try {
            recorder.stop();
            if (draft.length() < 64) throw new Exception();
            Files.move(draft.toPath(), new File(getFilesDir(), "cue.m4a").toPath(),
                StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            Bridge.notice = "Cue saved on this phone. Preview it before arming.";
        } catch (Exception e) {
            draft.delete(); Bridge.notice = "Recording was too short or could not save. Previous cue is unchanged.";
        } finally {
            recorder.release(); recorder = null; finishingRecording = false;
        }
    }
    private void playPreview() {
        if (recorder != null) { Bridge.notice = "Stop recording before previewing."; return; }
        if (CueService.running != null) { CueService.running.play("preview"); return; }
        stopPreview();
        File cue = new File(getFilesDir(), "cue.m4a");
        if (!cue.isFile()) { Bridge.notice = "Record your cue first."; return; }
        try {
            AudioManager audio = getSystemService(AudioManager.class);
            previewFocus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setOnAudioFocusChangeListener(change -> {
                    if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)
                        stopPreview();
                }, handler).build();
            if (audio.requestAudioFocus(previewFocus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                stopPreview(); Bridge.notice = "Audio is busy. Try again."; return;
            }
            preview = new MediaPlayer();
            preview.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            preview.setDataSource(cue.getAbsolutePath());
            preview.setOnCompletionListener(p -> stopPreview());
            preview.setOnErrorListener((p, what, extra) -> { stopPreview(); Bridge.notice = "Record your cue again."; return true; });
            preview.prepare(); preview.start(); Bridge.notice = "Playing your saved cue.";
        } catch (Exception e) { stopPreview(); Bridge.notice = "Cue could not play. Record it again."; }
    }
    private void stopPreview() {
        if (preview != null) { preview.release(); preview = null; }
        if (previewFocus != null) {
            getSystemService(AudioManager.class).abandonAudioFocusRequest(previewFocus); previewFocus = null;
        }
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == 21 && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startRecording();
        else if (results.length == 0 || results[0] != PackageManager.PERMISSION_GRANTED)
            Bridge.notice = "Permission was not granted. You can enable it in Android app settings.";
    }
    private void update() {
        try {
            JSONObject data = Vault.get(this).snapshot();
            JSONObject credential = data.optJSONObject("credential");
            String paired = credential == null ? "Not paired" :
                "Paired · " + credential.optString("pairedAt") + "\nConnection expires · " + credential.optString("expiresAt");
            if (status != null) {
                JSONArray queue = data.optJSONArray("outbox");
                String error = data.optString("credentialError");
                status.setText(paired + "\n\n" + (CueService.running != null ? "Armed — notification is running" : "Not armed") +
                    "\n\n" + (new File(getFilesDir(), "cue.m4a").isFile() ? "Cue recorded on this phone" : "Record your cue first") +
                    "\n\nLast event: " + data.optString("lastEvent", "None yet") +
                    "\nQueued status events: " + (queue == null ? 0 : queue.length()) +
                    (error.isEmpty() ? "" : "\n\n" + Mailbox.message(error)));
            }
            if (recorderStatus != null) recorderStatus.setText(recorder != null ? "Recording · maximum 10 seconds" :
                new File(getFilesDir(), "cue.m4a").isFile() ? "A cue is saved. Preview it below." : "No cue recorded yet.");
            if (feedback != null) {
                String pairingLabel = "Not paired".equals(Bridge.pairingState) && credential != null
                    ? "Paired · " + credential.optString("pairedAt") : Bridge.pairingState;
                String prefix = "Pairing".equals(page) ? pairingLabel + "\n\n" : "";
                feedback.setText(prefix + Bridge.notice);
            }
        } catch (Exception e) {
            if (feedback != null) feedback.setText("The encrypted connection cannot be opened. " +
                "Do not clear app data. Unlock the phone and try again.");
        }
    }
}
