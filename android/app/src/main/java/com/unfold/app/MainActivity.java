package com.unfold.app;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    private static class JsBridge {
        private final BridgeActivity activity;

        JsBridge(BridgeActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void exitApp() {
            if (activity == null) return;
            activity.runOnUiThread(() -> {
                try {
                    activity.moveTaskToBack(true);
                    activity.finishAndRemoveTask();
                } catch (Exception e) {
                    activity.finishAffinity();
                }
            });
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 브리지 생성 전에 플러그인을 먼저 등록해야 Capacitor.Plugins에 반영됨
        registerPlugin(BiometricBridge.class);

        super.onCreate(savedInstanceState);

        // 웹뷰 설정 가져오기
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings webSettings = webView.getSettings();

            // Mixed Content 허용 (HTTPS 페이지에서 HTTP 리소스 로드 허용)
            webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

            // JS → 네이티브 종료 브리지
            webView.addJavascriptInterface(new JsBridge(this), "AndroidBridge");
        }
    }

    @Override
    public void onBackPressed() {
        // 기본 종료를 막고, 웹뷰에 backbutton 이벤트 전달
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('backbutton'));", null));
            return;
        }
        super.onBackPressed();
    }
}
