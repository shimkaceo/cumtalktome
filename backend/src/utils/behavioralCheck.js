/**
 * La pagina intermedia que ve un visitante humano entre el toque del enlace
 * de la bio y el destino final. No tiene ningun elemento con el que
 * interactuar: solo un spinner mientras se procesa la salida.
 *
 * Flujo disenado (puerta dura: todo o nada):
 *   1. Toque del enlace dentro de Instagram -> abre el webview integrado.
 *   2. Cloudflare Turnstile 100% invisible como PUERTA, no acelerador.
 *      La invisibilidad real la da el tipo de widget Invisible en el
 *      dashboard de Cloudflare: NO existe data-size="invisible" (valor
 *      invalido que impide que el reto ejecute).
 *   3. Turnstile resuelve y /api/verify-turnstile acepta: salida inmediata
 *      (webview IG: rebote a instagram://extbrowser/ con la MISMA URL para
 *      forzar el navegador externo, que repite alli el ciclo; navegador
 *      normal: destino directo).
 *   4. Todo lo demas es bot y se va a Wikipedia sin ver nada: error o
 *      expiracion del widget, success:false del backend, POST roto o
 *      silencio a los 6 s. No hay fallback comportamental ni reto visual.
 *   5. Los bots obvios por User-Agent ni siquiera reciben este HTML: el
 *      servidor los manda a Wikipedia con 302.
 *   6. Si a los 2 segundos de rebotar el esquema no hubiera funcionado (la
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

    <!-- Turnstile, puerta dura. La invisibilidad NO viene de ningun
         atributo: data-size solo acepta normal/flexible/compact y un valor
         invalido (como "invisible") impide que el reto ejecute. Para
         garantizar que nunca se vea interfaz alguna, el widget debe ser de
         tipo Invisible en el dashboard de Cloudflare; appearance
         interaction-only es el cinturon de seguridad si llegase a ser
         Managed. Los callbacks deben existir en window ANTES de que cargue
         el script de CF, al final del body. -->
    <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onTurnstileSuccess" data-error-callback="onTurnstileError" data-expired-callback="onTurnstileError" data-appearance="interaction-only"></div>

    <script>
        (function () {
            const token = "${enJs(token)}";
            const destino = "${enJs(destino)}";
            const WIKIPEDIA = 'https://en.wikipedia.org/wiki/Shinka';
            const ua = navigator.userAgent.toLowerCase();

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

            // PUERTA DURA: 6 s sin veredicto (script bloqueado por un
            // adblock, red muy lenta, entorno automatizado sin retos) es
            // bot: Wikipedia. Son 6 s y no 3 porque en 3G la primera carga
            // de api.js puede superar los 3 s y un humano lento no merece
            // Wikipedia; para apretar, cambiar solo este numero.
            const temporizadorTurnstile = setTimeout(function () {
                if (!flujoIniciado) aWikipedia();
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
                            // success:false: veredicto de bot o token
                            // invalido. Sin segunda oportunidad.
                            aWikipedia();
                        }
                    })
                    .catch(function () {
                        // POST roto o respuesta ilegible: sin veredicto
                        // fiable no se deja pasar.
                        aWikipedia();
                    });

                // Cinturon de seguridad: el POST no puede colgar el flujo
                setTimeout(function () {
                    if (!flujoIniciado) aWikipedia();
                }, 5000);
            };

            // --- Cualquier fallo del widget (error o expiracion) es bot
            // hasta que se demuestre lo contrario: Wikipedia directa,
            // sin reto visual ni segunda oportunidad ---
            window.onTurnstileError = function (codigo) {
                console.log('Turnstile: error ' + codigo + ' -> Wikipedia');
                aWikipedia();
            };

        })();
    </script>

    <!-- Carga DESPUES del script inline para garantizar que
         window.onTurnstileSuccess ya existe cuando el widget arranque. -->
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</body>
</html>`;
}
