export function generateBehavioralHTML(token, destino) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirigiendo...</title>
    <meta name="session-token" content="${token}">
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center}
        .container{text-align:center;padding:40px}
        .spinner{width:50px;height:50px;border:4px solid #f3f3f3;border-top:4px solid #3498db;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        .message{color:#666;font-size:18px}
        .error{color:#e74c3c;display:none;margin-top:20px}
    </style>
</head>
<body>
    <div id="loading" class="container">
        <div class="spinner"></div>
        <div class="message">Verificando seguridad...</div>
        <div id="error" class="error">No se pudo verificar. Por favor, usa un navegador actual.</div>
    </div>

    <script>
        (function() {
            const token = document.querySelector('meta[name="session-token"]').content;
            const destino = "${destino.replace(/"/g, '&quot;')}";
            const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            
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
                    // Redirigir automáticamente
                    fetch('/api/behavior-check', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({token, mouseMoved, hasScrolled, touchDetected, isMobile})
                    }).finally(() => {
                        window.location.replace(destino);
                    });
                } else {
                    document.querySelector('.spinner').style.display = 'none';
                    document.querySelector('.message').style.display = 'none';
                    document.getElementById('error').style.display = 'block';
                }
            }, 1000);
        })();
    </script>
</body>
</html>`;
}
