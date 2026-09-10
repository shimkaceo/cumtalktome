/**
 * La pagina intermedia que ve un visitante humano entre el toque del enlace
 * de la bio y el destino final. No tiene ningun elemento con el que
 * interactuar: solo un spinner mientras se procesa la salida.
 *
 * Flujo disenado:
 *   1. Toque del enlace dentro de Instagram -> abre el webview integrado.
 *   2. Esta pagina detecta el webview (User-Agent movil con "Instagram") y
 *      redirige de inmediato, sin interaccion del usuario, al esquema
 *      instagram://extbrowser/ con la MISMA URL: eso fuerza la apertura del
 *      navegador externo (Safari/Chrome), que vuelve a pedir esta pagina.
 *   3. Ya en el navegador externo el UA ya no contiene "Instagram": se
 *      ejecuta el chequeo comportamental normal (POST a
 *      /api/behavior-check con el token de sesion) y se redirige al
 *      destino final.
 *   4. Si a los 2 segundos el esquema no hubiera funcionado (la pagina
 *      sigue visible dentro del webview), se hace ese mismo chequeo y se
 *      redirige al destino dentro del propio webview.
 */

export function generateBehavioralHTML(token, destino) {
  // El destino y el token se inyectan como literales de cadena dentro de
  // <script>: barras, comillas y "<" se escapan para evitar inyeccion.
  const enJs = (valor) => valor
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading...</title>
    <style>
        html,body{height:100%;margin:0}
        body{display:flex;align-items:center;justify-content:center;background:#fff}
        .spinner{width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #3498db;border-radius:50%;animation:spin 1s linear infinite}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
    </style>
</head>
<body>
    <!-- Unico elemento visible: el spinner mientras se procesa la salida -->
    <div class="spinner"></div>

    <script>
        (function () {
            const token = "${enJs(token)}";
            const destino = "${enJs(destino)}";
            const ua = navigator.userAgent.toLowerCase();

            // --- Senales pasivas que alimentan el chequeo del servidor ---
            let mouseMoved = false;
            let hasScrolled = false;
            window.addEventListener('mousemove', function () { mouseMoved = true; }, { once: true, passive: true });
            window.addEventListener('touchmove', function () { mouseMoved = true; }, { once: true, passive: true });
            window.addEventListener('scroll', function () { hasScrolled = true; }, { once: true, passive: true });

            // --- Chequeo comportamental y salida al destino final ---
            async function pasarChequeoYRedirigir() {
                try {
                    // El POST no puede bloquear la salida mas de 1.5 s
                    await Promise.race([
                        fetch('/api/behavior-check', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                token: token,
                                mouseMoved: mouseMoved,
                                hasScrolled: hasScrolled,
                                screenWidth: window.screen ? window.screen.width : 0,
                                screenHeight: window.screen ? window.screen.height : 0
                            }),
                            keepalive: true
                        }),
                        new Promise(function (resolver) { setTimeout(resolver, 1500); })
                    ]);
                } catch (e) {
                    // El chequeo nunca debe impedir la redireccion
                }
                window.location.replace(destino);
            }

            // --- Webview de Instagram: UA movil que contiene "instagram" ---
            const esWebviewInstagram = ua.indexOf('instagram') !== -1 &&
                /iphone|ipad|ipod|android|mobile/.test(ua);

            if (esWebviewInstagram) {
                // Si el esquema funciona, el navegador externo se abre y esta
                // pagina pasa a segundo plano: eso es el exito, no un fallo.
                let salioDeLaPagina = false;
                document.addEventListener('visibilitychange', function () {
                    if (document.hidden) salioDeLaPagina = true;
                });
                window.addEventListener('pagehide', function () { salioDeLaPagina = true; });

                // Rebote inmediato al navegador externo con la MISMA URL
                window.location.href = 'instagram://extbrowser/?url=' + encodeURIComponent(window.location.href);

                // Fallback: si a los 2 s seguimos visibles, el esquema no
                // funciono -> chequeo normal y destino dentro del webview
                setTimeout(function () {
                    if (!salioDeLaPagina) pasarChequeoYRedirigir();
                }, 2000);
                return;
            }

            // Navegador externo (o cualquier otro contexto): chequeo normal
            // y redireccion inmediata al destino final
            pasarChequeoYRedirigir();
        })();
    </script>
</body>
</html>`;
}
