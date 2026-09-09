export function generateBehavioralHTML(token, destino) {
  // ... (código anterior del CSS y HTML) ...
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading...</title>
    <style>
        /* Mantén tu CSS actual */
        body{font-family:system-ui;text-align:center;padding:50px;background:#f5f5f5}
        .spinner{width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #3498db;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        .message{color:#666}
        /* NUEVO ESTILO PARA EL BOTÓN */
        .fallback-btn {
            margin-top: 20px;
            padding: 10px 20px;
            background-color: #3498db;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            font-size: 16px;
        }
        .fallback-btn:hover { background-color: #2980b9; }
    </style>
</head>
<body>
    <div class="spinner"></div>
    <div class="message">Loading content...</div>
    
    <!-- BOTÓN DE FALLBACK -->
    <a href="${destino}" class="fallback-btn">Click here to continue</a>

    <script>
        (function() {
            const destino = "${destino.replace(/"/g, '&quot;')}";
            const ua = navigator.userAgent.toLowerCase();
            
            // ... (tu lógica de detección de Instagram/FB aquí) ...

            setTimeout(() => {
                // ... (tu lógica de redirección aquí) ...
                
                // Si falla la redirección o no es móvil, el botón sigue ahí como respaldo
            }, 800);
        })();
    </script>
</body>
</html>`;
}