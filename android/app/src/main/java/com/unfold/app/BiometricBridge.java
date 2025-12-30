package com.unfold.app;

import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

@CapacitorPlugin(name = "BiometricBridge")
public class BiometricBridge extends Plugin {
    private static final String TAG = "BiometricBridge";

    @PluginMethod
    public void authenticate(PluginCall call) {
        Log.i(TAG, "authenticate() called");
        FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                Executor executor = ContextCompat.getMainExecutor(activity);
                BiometricManager manager = BiometricManager.from(activity);

                // 기본: 강한 생체 + 기기 PIN/패턴 허용 (R 이상)
                int authenticators;
                BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder();

                String title = call.getString("title", "생체 인증");
                String subtitle = call.getString("subtitle", "민감 정보 보호를 위해 인증이 필요합니다.");
                String description = call.getString("description", "");
                String negative = call.getString("negative", "취소");

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG
                            | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
                    builder.setAllowedAuthenticators(authenticators);
                } else {
                    // R 미만: DEVICE_CREDENTIAL 미지원 → 생체만 + 취소 버튼
                    authenticators = BiometricManager.Authenticators.BIOMETRIC_WEAK;
                    builder.setAllowedAuthenticators(authenticators);
                    builder.setNegativeButtonText(negative);
                }

                int can = manager.canAuthenticate(authenticators);
                Log.i(TAG, "canAuthenticate=" + can + " authenticators=" + authenticators);
                if (can != BiometricManager.BIOMETRIC_SUCCESS) {
                    String reason = "biometric not available: code " + can;
                    Log.w(TAG, reason);
                    call.resolve(makeResult(false, true, reason));
                    return;
                }

                builder.setTitle(title)
                        .setSubtitle(subtitle)
                        .setDescription(description);

                BiometricPrompt.PromptInfo promptInfo = builder.build();

                BiometricPrompt prompt = new BiometricPrompt(activity, executor, new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        super.onAuthenticationSucceeded(result);
                        Log.i(TAG, "onAuthenticationSucceeded");
                        call.resolve(makeResult(true, false, null));
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        super.onAuthenticationError(errorCode, errString);
                        boolean cancelled = errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                || errorCode == BiometricPrompt.ERROR_USER_CANCELED
                                || errorCode == BiometricPrompt.ERROR_CANCELED;
                        Log.w(TAG, "onAuthenticationError code=" + errorCode + " msg=" + errString + " cancelled=" + cancelled);
                        call.resolve(makeResult(false, cancelled, errString.toString()));
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        super.onAuthenticationFailed();
                        // Do nothing; the prompt remains open for additional attempts.
                        Log.w(TAG, "onAuthenticationFailed");
                    }
                });

                prompt.authenticate(promptInfo);
            } catch (Exception e) {
                Log.e(TAG, "authenticate exception", e);
                call.resolve(makeResult(false, true, e.getMessage()));
            }
        });
    }

    private JSObject makeResult(boolean ok, boolean cancelled, String reason) {
        JSObject obj = new JSObject();
        obj.put("ok", ok);
        obj.put("cancelled", cancelled);
        if (reason != null) obj.put("reason", reason);
        return obj;
    }
}

