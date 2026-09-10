/**
 * La pagina intermedia que ve un visitante humano entre el toque del enlace
 * de la bio y el destino final. No tiene ningun elemento con el que
 * interactuar: solo un spinner mientras se procesa la salida.
 *
 * Flujo disenado (jerarquia de confianza, de mayor a menor):
 *   1. Toque del enlace dentro de Instagram -> abre el webview integrado.
 *   2. Cloudflare Turnstile (invisible) es un ACELERADOR, no un bloqueador.
 *      Si resuelve y /api/verify-turnstile lo acepta: confianza alta,
 *      salida inmediata SIN chequeo comportamental (webview IG: rebote a
 *      instagram://extbrowser/ con la MISMA URL para forzar el navegador
 *      externo, que repite alli el ciclo; navegador normal: destino).
 *   3. Si Turnstile falla, duda, tarda mas de 6 s o nuestro backend no
 *      responde: confianza media, caida graceful al chequeo
 *      comportamental TRADICIONAL (el flujo original pre-Turnstile): POST
 *      a /api/behavior-check con las senales pasivas y salida al destino.
 *   4. Wikipedia solo en confianza baja: un rechazo EXPLICITO del
 *      behavioral check (success:false). Los bots obvios por User-Agent
 *      nunca llegan a esta pagina: el servidor los manda a Wikipedia con
 *      302 antes de servir el HTML.
 *   5. Si a los 2 segundos de rebotar el esquema no hubiera funcionado (la
 *      pagina sigue visible dentro del webview), se redirige al destino
 *      dentro del propio webview.
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

    <!-- Turnstile. OJO: data-size solo acepta normal/flexible/compact; un
         valor invalido (como "invisible") impide que el reto ejecute. La
         invisibilidad real se configura creando el widget de tipo Invisible
         en el dashboard de Cloudflare. Si el widget es Managed,
         appearance=interaction-only lo mantiene fuera de la vista salvo que
         exija interaccion del visitante. Los callbacks deben existir en
         window ANTES de que cargue el script de CF, al final del body. -->
    <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onTurnstileSuccess" data-error-callback="onTurnstileError" data-timeout-callback="onTurnstileError" data-appearance="interaction-only"></div>

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

            let verificado = false;      // Turnstile ya dio su veredicto
            let flujoIniciado = false;   // ya se salio por algun camino

            function aWikipedia() {
                window.location.replace(WIKIPEDIA);
            }

            // --- Rebote al navegador externo (webview de Instagram) ---
            function rebotarAExtbrowser() {
                // Si el esquema funciona, el navegador externo se abre y esta
                // pagina pasa a segundo plano: eso es el exito, no un fallo.
                let salioDeLaPagina = false;
                document.addEventListener('visibilitychange', function () {
                    if (document.hidden) salioDeLaPagina = true;
                });
                window.addEventListener('pagehide', function () { salioDeLaPagina = true; });

                window.location.href = 'instagram://extbrowser/?url=' + encodeURIComponent(window.location.href);

                // Fallback: si a los 2 s seguimos visibles, el esquema no
                // funciono -> destino directo dentro del propio webview
                setTimeout(function () {
                    if (!salioDeLaPagina) window.location.replace(destino);
                }, 2000);
            }

            // --- Confianza ALTA: Turnstile confirmo humano -> flujo rapido ---
            function flujoRapido() {
                console.log('Turnstile: humano confirmado, flujo rapido');
                if (esWebviewInstagram) {
                    rebotarAExtbrowser();
                } else {
                    window.location.replace(destino);
                }
            }

            // --- Confianza MEDIA: chequeo comportamental TRADICIONAL ---
            // Flujo original pre-Turnstile: enviar las senales pasivas al
            // backend (que registra isHuman en redis para analisis) y salir
            // al destino. La telemetria nunca bloquea a un humano real:
            // solo un rechazo EXPLICITO del backend (success === false)
            // manda a Wikipedia. Un isHuman:false NO bloquea: en una pagina
            // de spinner que dura <1 s, un humano movil tipico no mueve
            // raton ni hace scroll.
            async function runBehavioralCheckTradicional() {
                if (flujoIniciado) return;
                flujoIniciado = true;

                let veredicto = null;
                try {
                    const respuesta = await Promise.race([
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
                        // El POST no puede bloquear la salida mas de 1.5 s
                        new Promise(function (resolver) {
                            setTimeout(function () { resolver(null); }, 1500);
                        })
                    ]);
                    if (respuesta) {
                        try { veredicto = await respuesta.json(); } catch (e) { }
                    }
                } catch (e) {
                    // Red rota o JSON invalido: asumir humano y salir
                }

                // Confianza BAJA: rechazo explicito -> Wikipedia
                if (veredicto && veredicto.success === false) {
                    aWikipedia();
                    return;
                }

                if (esWebviewInstagram) {
                    rebotarAExtbrowser();
                } else {
                    window.location.replace(destino);
                }
            }

            // Turnstile acelera, no bloquea: si en 6 s no resolvio (script
            // bloqueado, red lenta, entorno raro), caida graceful al
            // chequeo tradicional en lugar de bloquear.
            const temporizadorTurnstile = setTimeout(function () {
                if (!flujoIniciado) {
                    console.log('Turnstile: sin respuesta en 6 s, caida a behavioral check');
                    runBehavioralCheckTradicional();
                }
            }, 6000);

            // --- Verificacion del token de Turnstile contra el backend ---
            // Debe ser global: Turnstile invoca por nombre a data-callback.
            window.onTurnstileSuccess = function (tokenTurnstile) {
                if (verificado || flujoIniciado) return;
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
                            if (flujoIniciado) return;
                            flujoIniciado = true;
                            flujoRapido();
                        } else {
                            console.log('Turnstile: dudoso o rechazado, fallback a behavioral check');
                            runBehavioralCheckTradicional();
                        }
                    })
                    .catch(function (err) {
                        console.log('Turnstile: error de verificacion, asumiendo humano');
                        runBehavioralCheckTradicional();
                    });

                // Cinturon de seguridad: el POST no puede colgar el flujo
                setTimeout(function () {
                    if (!flujoIniciado) {
                        console.log('Turnstile: verificacion colgada, caida a behavioral check');
                        runBehavioralCheckTradicional();
                    }
                }, 5000);
            };

            // --- Errores del widget (dominio no configurado, script
            // bloqueado, red): degradacion INMEDIATA al chequeo
            // tradicional en lugar de esperar el timer de 6 s ---
            window.onTurnstileError = function (codigo) {
                console.log('Turnstile: error ' + codigo + ', caida a behavioral check');
                runBehavioralCheckTradicional();
            };

        })();
    </script>

    <!-- Carga DESPUES del script inline para garantizar que
         window.onTurnstileSuccess ya existe cuando el widget arranque. -->
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</body>
</html>`;
}
