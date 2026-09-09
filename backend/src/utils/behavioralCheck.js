export function generateBehavioralHTML(token, destino) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading...</title>
    <meta name="session-token" content="${token}">
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;min-height:100vh;display:flex;align-items:center;justify-content:center}
        .container{text-align:center;padding:40px}
        .spinner{width:40px;height:40px;border:3px solid #f0f0f0;border-top:3px solid #3897f0;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 15px}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        .message{color:#999;font-size:16px}
        .error{color:#ed4956;display:none;margin-top:20px;font-size:14px}
    </style>
</head>
<body>
    <div id="loading" class="container">
        <div class="spinner"></div>
        <div class="message">Loading content...</div>
        <div id="error" class="error">Unable to load. Please try a different browser.</div>
    </div>

    <script>
        (function() {
            const token = document.querySelector('meta[name="session-token"]').content;
            const destino = "${destino.replace(/"/g, '&quot;')}";
            const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            const ua = navigator.userAgent.toLowerCase();
            
            const isInstagram = ua.includes('instagram');
            const isFBApp = ua.includes('fb_iab') || ua.includes('fb_an');
            const isReddit = ua.includes('reddit');
            
            let mouseMoved = false, hasScrolled = false, keyPressed = false, touchDetected = false;
            
            document.addEventListener('mousemove', () => mouseMoved = true);
            document.addEventListener('scroll', () => hasScrolled = true);
            document.addEventListener('keydown', () => keyPressed = true);
            document.addEventListener('touchstart', () => touchDetected = true);
            
            const screenValid = window.screen.width > 0 && window.screen.height > 0;
            
            setTimeout(() => {
                let humanScore = 0;
                if (mouseMoved) humanScore++;
                if (hasScrolled) humanScore++;
                if (keyPressed) humanScore++;
                if (screenValid) humanScore++;
                if (touchDetected) humanScore += 2;
                
                const requiredScore = isMobile ? 1 : 2;
                
                if (humanScore >= requiredScore) {
                    fetch('/api/behavior-check', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({token, mouseMoved, hasScrolled, touchDetected, isMobile})
                    }).finally(() => {
                        // Abrir fuera de apps de redes sociales
                        if (isInstagram && /iphone|ipad|ipod/.test(ua)) {
                            window.location.replace("instagram://extbrowser/?url=" + encodeURIComponent(destino));
                            setTimeout(() => window.location.replace(destino), 1500);
                        } else if ((isInstagram || isFBApp) && /android/.test(ua)) {
                            const url = destino.replace(/^https?:\/\//, '');
                            window.location.replace("intent://" + url + "#Intent;package=com.android.chrome;scheme=https;end");
                            setTimeout(() => window.location.replace(destino), 1500);
                        } else if (isReddit && /iphone|ipad|ipod/.test(ua)) {
                            window.location.replace("googlechrome://" + destino.replace(/^https?:\/\//, ''));
                            setTimeout(() => window.location.replace(destino), 1500);
                        } else {
                            window.location.replace(destino);
                        }
                    });
                } else {
                    document.querySelector('.spinner').style.display = 'none';
                    document.querySelector('.message').style.display = 'none';
                    document.getElementById('error').style.display = 'block';
                }
            }, 800);
        })();
    </script>
</body>
</html>`;
}
