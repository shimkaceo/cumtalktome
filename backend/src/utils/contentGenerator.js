const contentTemplates = {
  photography: {
    titles: ["Explorando Nuevas Perspectivas","Arte Visual Contemporáneo","Capturando Momentos Únicos"],
    descriptions: ["Descubre técnicas avanzadas de fotografía artística"],
    images: ["/assets/hero-1.jpg"]
  },
  fitness: {
    titles: ["Transformación Total","Rutinas de Élite"],
    descriptions: ["Descubre rutinas de entrenamiento"],
    images: ["/assets/fitness-1.jpg"]
  },
  lifestyle: {
    titles: ["Estilo de Vida Moderno","Inspiración Diaria"],
    descriptions: ["Inspiración para una vida plena"],
    images: ["/assets/lifestyle-1.jpg"]
  },
  fashion: {
    titles: ["Moda y Estilo","Tendencias Únicas"],
    descriptions: ["Descubre las últimas tendencias"],
    images: ["/assets/fashion-1.jpg"]
  }
};

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export function generateSemanticHTML(linkData, userAgent) {
  const category = linkData.category || 'lifestyle';
  const template = contentTemplates[category] || contentTemplates.lifestyle;
  const title = linkData.title || getRandomElement(template.titles);
  const description = linkData.description || getRandomElement(template.descriptions);
  const image = linkData.image || getRandomElement(template.images);
  const currentUrl = `https://cumtalkto.me/${linkData.slug}`;
  
  const honeypotLinks = `
    <a href="/hidden/access-point" style="position:absolute;left:-9999px;top:-9999px;" tabindex="-1" aria-hidden="true"> </a>
    <a href="/hidden/access-point?t=offscreen" style="display:none;" tabindex="-1"> </a>
    <link rel="alternate" href="/hidden/access-point?t=hidden" type="text/xml" title="RSS" />
  `;
  
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${currentUrl}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">
    <meta property="og:site_name" content="CumTalkToMe">
    <meta property="og:locale" content="es_ES">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${currentUrl}">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">
    <link rel="canonical" href="${currentUrl}">
    <meta name="robots" content="index, follow">
    <meta name="author" content="${linkData.author || 'Content Creator'}">
    <style>
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;max-width:800px;margin:0 auto;padding:40px 20px;color:#333}
        h1{color:#1a1a1a;margin-bottom:20px}
        .meta{color:#666;font-size:14px;margin-bottom:30px}
        .content{font-size:18px;line-height:1.8}
        .image-container{margin:30px 0}
        .image-container img{max-width:100%;border-radius:8px}
        .tags{margin-top:30px}
        .tag{display:inline-block;background:#f0f0f0;padding:5px 15px;border-radius:20px;margin-right:10px;font-size:14px}
    </style>
</head>
<body>
    ${honeypotLinks}
    <article>
        <h1>${title}</h1>
        <div class="meta">
            Publicado el ${new Date().toLocaleDateString('es-ES')} 
            por ${linkData.author || 'Content Creator'}
        </div>
        <div class="image-container">
            <img src="${image}" alt="${title}">
        </div>
        <div class="content">
            <p>${description}</p>
            <p>Bienvenidos a este espacio dedicado a la exploración creativa y el compartir momentos únicos. 
            Aquí encontrarás contenido inspirador, ideas frescas y una visión única sobre ${category}.</p>
            <p>Mi objetivo es crear una comunidad donde podamos aprender juntos, compartir experiencias 
            y descubrir nuevas perspectivas. Cada publicación está pensada para aportar valor e inspiración 
            a tu día a día.</p>
            <p>Gracias por ser parte de esta comunidad. Tu apoyo y participación hacen que todo esto sea posible.</p>
        </div>
        <div class="tags">
            <span class="tag">#${category}</span>
            <span class="tag">#creatividad</span>
            <span class="tag">#inspiración</span>
            <span class="tag">#comunidad</span>
        </div>
    </article>
</body>
</html>`;

  return html;
}
