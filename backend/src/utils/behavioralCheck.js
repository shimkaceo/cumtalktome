/**
 * La pagina que ve un visitante humano entre el clic en el enlace de la bio
 * y el destino final.
 *
 * No se hace un redirect automatico: los navegadores integrados de las apps
 * (el de Instagram sobre todo) castigan esas cadenas y a veces las bloquean.
 * Hace falta un clic del usuario, y ese clic se aprovecha para algo mejor:
 * dentro del navegador integrado de Instagram en movil, el boton abre el
 * navegador externo con el esquema instagram://extbrowser/, que es donde el
 * contenido se ve bien. En cualquier otro caso el boton es un enlace normal
 * al destino: funciona siempre, incluso sin JavaScript.
 */

export function generateBehavioralHTML(token, destino) {
  // `token` queda reservado para validar la sesion contra /api/validate-token
  // cuando se retome la comprobacion comportamental. Hoy no se usa, pero se
  // mantiene en la firma para no tocar el punto de llamada en server.js.

  // El destino se inyecta en dos contextos con reglas de escape distintas:
  // atributo HTML (entidades) y literal de cadena dentro de <script>.
  const enHtml = destino
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const enJs = destino
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
        body{font-family:system-ui;text-align:center;padding:50px;background:#f5f5f5}
        .spinner{width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #3498db;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        .message{color:#666}
        .action-btn{margin-top:20px;padding:12px 24px;background-color:#3498db;color:#fff;border:none;border-radius:5px;cursor:pointer;text-decoration:none;display:inline-block;font-size:16px}
        .action-btn:hover{background-color:#2980b9}
    </style>
</head>
<body>
    <div class="spinner"></div>
    <div class="message">Loading content...</div>

    <!-- Enlace normal al destino: la via que funciona en cualquier navegador,
         con o sin JavaScript. En Instagram movil el script de abajo lo mejora. -->
    <a href="${enHtml}" id="abrir" class="action-btn" rel="noopener">Open in Browser</a>

    <script>
        (function () {
            const destino = "${enJs}";
            const boton = document.getElementById('abrir');
            const ua = navigator.userAgent.toLowerCase();

            // El navegador integrado de Instagram se identifica en el User
            // Agent. Fuera de ahi el enlace normal ya hace todo lo necesario.
            if (ua.indexOf('instagram') === -1) return;

            const esquema = 'instagram://extbrowser/?url=' + encodeURIComponent(destino);
            let cancelado = false;

            // Si el esquema funciona, esta pagina pasa a segundo plano al
            // abrirse el navegador externo: no hay que disparar tambien el
            // fallback dentro del navegador integrado.
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) cancelado = true;
            });

            boton.addEventListener('click', function (e) {
                e.preventDefault();
                window.location.href = esquema;
                // Si el esquema no esta disponible el navegador se queda donde
                // esta: un momento despues caemos al enlace normal.
                setTimeout(function () {
                    if (!cancelado) window.location.href = destino;
                }, 1500);
            });
        })();
    </script>
</body>
</html>`;
}
