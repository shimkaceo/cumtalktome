// Plantilla HTML con detección de comportamiento humano
export function generateBehavioralHTML(token, destino) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cargando...</title>
    <meta name="session-token" content="${token}">
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center}
        .container{text-align:center;padding:40px}
        .spinner{width:50px;height:50px;border:4px solid #f3f3f3;border-top:4px solid #3498db;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        .message{color:#666;font-size:18px}
        .error{color:#e74c3c;display:none;margin-top:20px}
        #content{display:none;text-align:left;max-width:600px;margin:0 auto;background:white;padding:40px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
    </style>
</head>
<body>
    <div id="loading" class="container">
        <div class="spinner"></div>
        <div class="message">Verificando seguridad...</div>
        <div id="error" class="error">No se pudo verificar. Por favor, usa un navegador actual.</div>
    </div>
    
    <div id="content">
        <h1>Contenido Exclusivo</h1>
        <p>Redirigiendo a tu destino...</p>
        <button onclick="window.location.href='${destino}'" style="margin-top:20px;padding:15px 30px;background:#3498db;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px">Continuar</button>
    </div>

    <script>
        (function() {
            const token = document.querySelector('meta[name="session-token"]').content;
            const destino = "${destino.replace(/"/g, '&quot;')}";
            
            // Métricas de comportamiento
            let mouseMoved = false;
            let hasScrolled = false;
            let keyPressed = false;
            let timeOnPage = 0;
            
            // Detectar movimiento de ratón
            document.addEventListener('mousemove', () => { mouseMoved = true; });
            
            // Detectar scroll
            document.addEventListener('scroll', () => { hasScrolled = true; });
            
            // Detectar teclado
            document.addEventListener('keydown', () => { keyPressed = true; });
            
            // Verificar tamaño de pantalla (bots headless suelen tener 0x0 o valores raros)
            const screenValid = window.screen.width > 0 && window.screen.height > 0 && window.innerWidth > 0;
            
            // Verificar después de 2.5 segundos
            setTimeout(() => {
                timeOnPage = 2500;
                
                // Score de humanidad: necesita al menos 2 señales positivas
                let humanScore = 0;
                if (mouseMoved) humanScore++;
                if (hasScrolled) humanScore++;
                if (keyPressed) humanScore++;
                if (screenValid) humanScore++;
                
                console.log('Human score:', humanScore, {mouseMoved, hasScrolled, keyPressed, screenValid});
                
                if (humanScore >= 2) {
                    // Es humano - mostrar contenido
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('content').style.display = 'block';
                    
                    // Notificar al servidor que pasó la prueba
                    fetch('/api/behavior-check', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            token: token,
                            mouseMoved: mouseMoved,
                            hasScrolled: hasScrolled,
                            screenWidth: window.screen.width,
                            screenHeight: window.screen.height
                        })
                    });
                } else {
                    // Probable bot - mostrar error
                    document.querySelector('.spinner').style.display = 'none';
                    document.querySelector('.message').style.display = 'none';
                    document.getElementById('error').style.display = 'block';
                }
            }, 2500);
        })();
    </script>
</body>
</html>`;
}
