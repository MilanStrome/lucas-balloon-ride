package com.rvappstudios.lucasballoonride;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Requests RECORD_AUDIO before the web layer calls getUserMedia, so the WebView's own
 * permission request (handled by Capacitor's BridgeWebChromeClient) is then granted.
 */
@CapacitorPlugin(name = "MicPermission", permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) })
public class MicPermissionPlugin extends Plugin {
    @PluginMethod
    public void request(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            resolve(call, true);
        } else {
            requestPermissionForAlias("microphone", call, "onResult");
        }
    }

    @PermissionCallback
    private void onResult(PluginCall call) {
        resolve(call, getPermissionState("microphone") == PermissionState.GRANTED);
    }

    private void resolve(PluginCall call, boolean granted) {
        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }
}
