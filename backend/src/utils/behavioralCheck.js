/**
 * La pagina intermedia que ve un visitante humano entre el toque del enlace
 * de la bio y el destino final. No tiene ningun elemento con el que
 * interactuar: solo un spinner mientras se procesa la salida.
 *
 * Flujo disenado:
 *   1. Toque del enlace dentro de Instagram -> abre el webview integrado.
 *   2. Cloudflare Turnstile (invisible) se ejecuta en la propia pagina y su
 *      token se envia a /api/verify-turnstile. NADA ocurre antes de esa
 *      verificacion: ni el rebote instagram://extbrowser/ ni el chequeo
 *      comportamental. Si Turnstile no resuelve en 6 s, o el backend
 *      rechaza el token, el visitante no es un navegador humano normal
 *      -> https://en.wikipedia.org/wiki/Shinka
 *   3. Verificado: si el UA es el webview de Instagram, se redirige al
 *      esquema instagram://extbrowser/ con la MISMA URL: eso fuerza la
 *      apertura del navegador externo (Safari/Chrome), que vuelve a pedir
 *      esta pagina (y repite alli el mismo Turnstile).
 *   4. Ya en el navegador externo el UA ya no contiene "Instagram":
 *      verificado de nuevo, se ejecuta el chequeo comportamental (POST a
 *      /api/behavior-check con el token de sesion) y se redirige al
 *      destino final.
 *   5. Si a los 2 segundos de rebotar el esquema no hubiera funcionado (la
 *      pagina sigue visible dentro del webview), se hace ese mismo chequeo
 *      y se redirige al destino dentro del propio webview.
 */

// Sitekey publica de Turnstile (es un valor publico por diseno). Se puede
// sobreescribir con la variable de entorno TURNSTILE_SITE_KEY.
export const TURNSTILE_SITE_KEY =
  process.env.TURNSTILE_SITE_KEY || '0x4AAAAAAEu6UyWrDgs3BtBK';

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

    <!-- Turnstile invisible. El callback debe existir en window ANTES de
         que cargue el script de Cloudflare, que va al final del body. -->
    <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onTurnstileSuccess" data-size="invisible"></div>

    <script>
        (function () {
            const token = "${enJs(token)}";
            const destino = "${enJs(destino)}";
            const WIKIPEDIA = 'https://en.wikipedia.org/wiki/Shinka';
            const ua = navigator.userAgent.toLowerCase();

            // --- Senales pasivas que alimentan el chequeo del servidor ---
            let mouseMoved = false;
            let hasScrolled = false;
            window.addEventListener('mousemove', function () { mouseMoved = true; }, { once: true, passive: true });
            window.addEventListener('touchmove', function () { mouseMoved = true; }, { once: true, passive: true });
            window.addEventListener('scroll', function () { hasScrolled = true; }, { once: true, passive: true });

            const esWebviewInstagram = ua.indexOf('instagram') !== -1 &&
                /iphone|ipad|ipod|android|mobile/.test(ua);

            let verificado = false;
            let flujoIniciado = false;

            function aWikipedia() {
                window.location.replace(WIKIPEDIA);
            }

            // Turnstile debe resolver rapido (~100 ms una vez cargado el
            // reto). Si en 6 s no hay verificacion exitosa (script
            // bloqueado, headless sin retos, red rota), no es un navegador
            // humano normal -> Wikipedia.
            const temporizadorTurnstile = setTimeout(function () {
                aWikipedia();
            }, 6000);

            // --- Verificacion del token de Turnstile contra el backend ---
            // Debe ser global: Turnstile invoca por nombre a data-callback.
            window.onTurnstileSuccess = function (tokenTurnstile) {
                if (verificado) return;
                verificado = true;
                clearTimeout(temporizadorTurnstile);

                fetch('/api/verify-turnstile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: tokenTurnstile }),
                    keepalive: true
                })
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        if (d && d.success === true) {
                            flujoAprobado();
                        } else {
                            aWikipedia();
                        }
                    })
                    .catch(function () {
                        // Red rota o JSON invalido: entorno raro -> bot
                        aWikipedia();
                    });

                // Cinturon de seguridad: el POST no puede colgar el flujo
                setTimeout(function () {
                    if (!flujoIniciado) aWikipedia();
                }, 5000);
            };

            // --- Chequeo comportamental y salida al destino final ---
            async function pasarChequeoYRedirigir() {
                flujoIniciado = true;
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

            // --- Flujo una vez que Turnstile ha verificado al visitante ---
            function flujoAprobado() {
                if (!esWebviewInstagram) {
                    // Navegador externo: chequeo normal y salida
                    pasarChequeoYRedirigir();
                    return;
                }

                // Si el esquema funciona, el navegador externo se abre y esta
                // pagina pasa a segundo plano: eso es el exito, no un fallo.
                let salioDeLaPagina = false;
                document.addEventListener('visibilitychange', function () {
                    if (document.hidden) salioDeLaPagina = true;
                });
                window.addEventListener('pagehide', function () { salioDeLaPagina = true; });

                // Rebote al navegador externo con la MISMA URL
                window.location.href = 'instagram://extbrowser/?url=' + encodeURIComponent(window.location.href);

                // Fallback: si a los 2 s seguimos visibles, el esquema no
                // funciono -> chequeo normal y destino dentro del webview
                setTimeout(function () {
                    if (!salioDeLaPagina) pasarChequeoYRedirigir();
                }, 2000);
            }
        })();
    </script>

    <!-- Carga DESPUES del script inline para garantizar que
         window.onTurnstileSuccess ya existe cuando el widget arranque. -->
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</body>
</html>`;
}
