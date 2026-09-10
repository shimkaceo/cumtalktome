/**
 * La pagina intermedia que ve un visitante humano entre el toque del enlace
 * de la bio y el destino final. No tiene ningun elemento con el que
 * interactuar: solo un spinner mientras se procesa la salida.
 *
 * Flujo disenado (politica intermedia: fallo explicito = bot, silencio =
 * duda razonable):
 *   1. Toque del enlace dentro de Instagram -> abre el webview integrado.
 *   2. Cloudflare Turnstile (invisible) como PUERTA: si resuelve y
 *      /api/verify-turnstile lo acepta, salida inmediata SIN chequeo
 *      comportamental (webview IG: rebote a instagram://extbrowser/ con la
 *      MISMA URL para forzar el navegador externo, que repite alli el
 *      ciclo; navegador normal: destino).
 *   3. Fallo EXPLICITO de Turnstile = Wikipedia inmediata, sin reto visual
 *      ni mensaje de error: callback de error, expiracion o timeout del
 *      widget, o success:false del backend (token rechazado).
 *   4. Silencio o ambiguedad = caida al chequeo comportamental
 *      TRADICIONAL (el flujo original pre-Turnstile): 6 s sin veredicto
 *      (adblock, red muy lenta), POST de verificacion roto o colgado.
 *      Un fallo de NUESTRA red no es un veredicto de Cloudflare: no
 *      castiga a humanos con VPN, adblock o 3G.
 *   5. Los bots obvios por User-Agent nunca llegan a esta pagina: el
 *      servidor los manda a Wikipedia con 302 antes de servir el HTML.
 *   6. Si a los 2 segundos de rebotar el esquema no hubiera funcionado (la
 *      pagina sigue visible dentro del webview), se redirige al destino
 *      dentro del propio webview.
 *
 * CAPAS de senales que acompanan al token: fingerprint pasivo (canvas +
 * WebGL + nucleos) y velocidades de ejecucion, recolectados de forma
 * sincrona al cargar y enviados en el POST a /api/verify-turnstile. El
 * backend los puntua (umbral 60, multiples senales juntas) y un
 * success:false por fingerprint tambien acaba en Wikipedia.
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
         exija interaccion del visitante. Error, expiracion y timeout del
         reto son fallos EXPLICITOS: todos van a onTurnstileError (que
         redirige a Wikipedia). Los callbacks deben existir en window ANTES
         de que cargue el script de CF, al final del body. -->
    <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onTurnstileSuccess" data-error-callback="onTurnstileError" data-expired-callback="onTurnstileError" data-timeout-callback="onTurnstileError" data-appearance="interaction-only"></div>

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

            // --- CAPA 1: fingerprint pasivo (canvas + WebGL + hardware) ---
            // Sincrono, nada mas cargar y ANTES de que Turnstile resuelva:
            // acompagna al token en el POST a /api/verify-turnstile. Un
            // navegador headless renderiza distinto u omite partes del
            // canvas, usa renderizadores de software (Mesa, SwiftShader) y
            // reporta numeros de nucleos tipicos de VM.
            function collectFingerprint() {
                const fingerprint = {
                    canvas: null,
                    webgl: { renderer: null, vendor: null },
                    hardwareConcurrency: null,
                    timestamp: Date.now()
                };

                // 1. Canvas fingerprinting (rapido, ~10 ms)
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 200;
                    canvas.height = 50;
                    const ctx = canvas.getContext('2d');

                    // Contenido que los headless suelen renderizar distinto
                    ctx.fillStyle = 'rgb(255, 0, 0)';
                    ctx.fillRect(0, 0, 200, 50);
                    ctx.fillStyle = 'rgb(0, 255, 0)';
                    ctx.font = '20px Arial';
                    ctx.fillText('BotCheck v1.2', 10, 30);

                    // Degradado que algunos headless omiten
                    const gradient = ctx.createLinearGradient(0, 0, 200, 0);
                    gradient.addColorStop(0, 'blue');
                    gradient.addColorStop(1, 'white');
                    ctx.fillStyle = gradient;
                    ctx.fillRect(0, 40, 200, 10);

                    // Solo los primeros caracteres: suficiente para el score
                    fingerprint.canvas = canvas.toDataURL('image/png').substring(0, 100);
                } catch (e) {
                    fingerprint.canvas = 'error';
                }

                // 2. WebGL: detectar renderizadores de software / VM
                try {
                    const gl = document.createElement('canvas').getContext('webgl') ||
                        document.createElement('canvas').getContext('experimental-webgl');
                    if (gl) {
                        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                        if (debugInfo) {
                            fingerprint.webgl.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                            fingerprint.webgl.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                        }
                    }
                } catch (e) {
                    fingerprint.webgl = { renderer: 'error', vendor: 'error' };
                }

                // 3. Nucleos: bots tipicos 1-2 o valores de servidor cloud
                fingerprint.hardwareConcurrency = navigator.hardwareConcurrency || null;

                return fingerprint;
            }

            // --- CAPA 2: velocidades de ejecucion (timing) ---
            // Un canvas de 500x500 con 1000 rects y un bucle de 1M de
            // operaciones: los tiempos imposiblemente rapidos (omision o
            // caché) o irregulares delatan VMs y automatizaciones.
            function measureExecutionSpeed() {
                const speeds = {
                    canvasRender: 0,
                    mathLoop: 0,
                    total: 0
                };

                // Test 1: tiempo de renderizado de un canvas complejo
                const startCanvas = performance.now();
                try {
                    const c = document.createElement('canvas');
                    c.width = 500;
                    c.height = 500;
                    const x = c.getContext('2d');
                    for (let i = 0; i < 1000; i++) {
                        x.fillStyle = 'hsl(' + i + ', 100%, 50%)';
                        x.fillRect(i % 50 * 10, Math.floor(i / 50) * 10, 10, 10);
                    }
                    c.toDataURL();
                } catch (e) { }
                speeds.canvasRender = performance.now() - startCanvas;

                // Test 2: bucle matematico pesado (VMs inconsistentes)
                const startMath = performance.now();
                let resultadoBucle = 0;
                for (let i = 0; i < 1000000; i++) {
                    resultadoBucle += Math.sin(i) * Math.cos(i);
                }
                speeds.mathLoop = performance.now() - startMath;

                speeds.total = performance.now() - startCanvas;

                return speeds;
            }

            // Se recolecta UNA vez, de forma sincrona, nada mas cargar:
            // cuesta decimas de segundo y viaja con el token de Turnstile.
            const huella = collectFingerprint();
            huella.speeds = measureExecutionSpeed();

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

            // Silencio no es veredicto: si en 6 s Turnstile no dijo nada
            // (script bloqueado por adblock, red lenta, entorno raro), no
            // es un fallo explicito de Cloudflare: caida al chequeo
            // tradicional en lugar de bloquear a un humano posible.
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

                // El token viaja junto al fingerprint (capas 1 y 2) para
                // que el backend lo puntue antes de aceptar el token.
                fetch('/api/verify-turnstile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: tokenTurnstile, fingerprint: huella, timestamp: Date.now() }),
                    keepalive: true
                })
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        if (d && d.success === true) {
                            if (flujoIniciado) return;
                            flujoIniciado = true;
                            flujoRapido();
                        } else {
                            // Veredicto EXPLICITO de rechazo (token invalido
                            // o duplicado): bot, sin segunda oportunidad.
                            console.log('Turnstile: rechazado por el backend -> Wikipedia');
                            aWikipedia();
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

            // --- Fallo EXPLICITO del widget (callback de error, expiracion
            // o timeout del reto): veredicto de bot. Wikipedia inmediata,
            // sin reto visual ni mensaje de error. OJO: un adblock que
            // bloquea challenges.cloudflare.com normalmente NO dispara esto
            // (el script ni carga): ese caso lo cubre el timer de 6 s con
            // caida al chequeo comportamental. ---
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
