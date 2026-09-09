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
        #debug{color:#999;font-size:12px;margin-top:20px}
    </style>
</head>
<body>
    <div class="spinner"></div>
    <div class="message">Loading content...</div>
    <div id="debug">Iniciando...</div>

    <script>
        (function() {
            const destino = "${destino.replace(/"/g, '&quot;')}";
            const debug = document.getElementById('debug');
            
            debug.textContent = 'Detectando...';
            
            // Detectar comportamiento básico
            let moved = false;
            document.addEventListener('mousemove', () => moved = true);
            document.addEventListener('touchstart', () => moved = true);
            
            // Esperar un poco y redirigir directamente (sin verificación compleja)
            setTimeout(() => {
                debug.textContent = 'Redirigiendo...';
                window.location.replace(destino);
            }, 1500);
        })();
    </script>
</body>
</html>`;
}