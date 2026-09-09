export function generateBehavioralHTML(token, destino) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading...</title>
    <style>
        body{font-family:system-ui;text-align:center;padding:50px;background:#f5f5f5}
        .spinner{width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #3498db;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        .message{color:#666}
    </style>
</head>
<body>
    <div class="spinner"></div>
    <div class="message">Loading content...</div>

    <script>
        (function() {
            const destino = "${destino.replace(/"/g, '&quot;')}";
            const ua = navigator.userAgent.toLowerCase();
            const isInstagram = ua.includes('instagram');
            const isFBApp = ua.includes('fb_iab') || ua.includes('fb_an');
            
            // Detectar si es iOS o Android
            const isIOS = /iphone|ipad|ipod/.test(ua);
            const isAndroid = /android/.test(ua);
            
            setTimeout(() => {
                // Si viene de Instagram/FB en móvil, abrir fuera
                if (isInstagram && isIOS) {
                    // iOS + Instagram → Safari externo
                    window.location.replace("instagram://extbrowser/?url=" + encodeURIComponent(destino));
                    setTimeout(() => window.location.replace(destino), 1500);
                } else if ((isInstagram || isFBApp) && isAndroid) {
                    // Android + Instagram/FB → Chrome externo
                    const url = destino.replace(/^https?:\/\//, '');
                    window.location.replace("intent://" + url + "#Intent;package=com.android.chrome;scheme=https;end");
                    setTimeout(() => window.location.replace(destino), 1500);
                } else {
                    // Resto → redirección normal
                    window.location.replace(destino);
                }
            }, 800);
        })();
    </script>
</body>
</html>`;
}