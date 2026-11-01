package net.agenticcorporation.pauseandnourish;

import android.app.Notification;
import android.content.*;
import android.view.KeyEvent;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

/** Platform-shaped tests, not a substitute for actual Samsung/headset routing. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class ServiceTest {
    private ServiceController<CueService> controller;
    @After public void cleanup() {
        if (controller != null) controller.destroy();
        CueService.running = null;
        Bridge.visible = false;
    }
    private CueService start(long expiry) {
        Context app = RuntimeEnvironment.getApplication();
        controller = Robolectric.buildService(CueService.class,
            new Intent(app, CueService.class).setAction(CueService.ARM).putExtra("expiresAt",expiry));
        controller.create().startCommand(0,1);
        return controller.get();
    }
    @Test public void armedStateHasActualForegroundNotificationAndStopControl() {
        CueService service = start(System.currentTimeMillis() + 60000);
        assertSame(service, CueService.running);
        Notification n = shadowOf(service).getLastForegroundNotification();
        assertNotNull(n);
        assertTrue((n.flags & Notification.FLAG_ONGOING_EVENT) != 0);
        assertEquals("Second Brain Watch — armed", n.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertEquals("Stop",n.actions[0].title);
        assertNotNull(n.actions[0].actionIntent);
        assertNotNull(n.extras.getParcelable(Notification.EXTRA_MEDIA_SESSION));
    }
    @Test public void expiredSessionNeverClaimsArmed() {
        start(System.currentTimeMillis() - 1000);
        assertNull(CueService.running);
    }
    @Test public void mediaButtonWithoutCueProducesNoFalsePlayedEvent() {
        CueService service = start(System.currentTimeMillis() + 60000);
        new java.io.File(service.getFilesDir(),"cue.m4a").delete();
        assertTrue(service.button(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)));
        assertEquals("Record your cue first.",Bridge.notice);
        assertFalse(service.button(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_VOLUME_UP)));
    }
    @Test public void mediaButtonCannotArmAStoppedService() {
        Context app = RuntimeEnvironment.getApplication();
        CueService.running = null;
        new MediaButtonReceiver().onReceive(app,new Intent(Intent.ACTION_MEDIA_BUTTON)
            .putExtra(Intent.EXTRA_KEY_EVENT,new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_HEADSETHOOK)));
        assertNull(CueService.running);
        assertNull(shadowOf(RuntimeEnvironment.getApplication()).getNextStartedService());
    }
}
