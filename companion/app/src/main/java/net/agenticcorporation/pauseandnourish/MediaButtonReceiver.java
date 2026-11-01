package net.agenticcorporation.pauseandnourish;

import android.content.*;
import android.view.KeyEvent;

/** A media-button broadcast never starts or arms a stopped session. */
public final class MediaButtonReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) return;
        CueService service = CueService.running;
        if (service != null) service.button((KeyEvent)intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT));
    }
}
