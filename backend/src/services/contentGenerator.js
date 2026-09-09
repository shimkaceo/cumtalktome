import { prisma } from '../server.js';

const templates = {
  FOTOGRAFIA: {
    titles: [
      'Capturando Momentos: El Arte de la Fotografía Contemporánea',
      'Luz y Sombra: Explorando la Fotografía Artística',
      'Detrás del Objetivo: Historias Visuales',
      'Composición y Emoción: Fotografía Creativa'
    ],
    paragraphs: [
      'La fotografía es mucho más que capturar imágenes; es el arte de preservar emociones, contar historias silenciosas y transformar lo ordinario en extraordinario.',
      'En el mundo digital actual, la autenticidad visual se ha convertido en un lenguaje universal. Las imágenes que creamos reflejan no solo lo que vemos, sino cómo sentimos.',
      'La creatividad fotográfica surge de la combinación de técnica, intuición y momento. Es en esa intersección donde nacen las imágenes que realmente conectan.',
      'Explorar diferentes técnicas y estilos nos permite expandir nuestra visión artística. Desde la fotografía analógica hasta las últimas tendencias digitales.'
    ],
    tags: ['fotografía', 'arte visual', 'creatividad', 'inspiración', 'composición']
  },
  ARTE: {
    titles: [
      'Expresión Creativa: El Poder del Arte Visual',
      'Colores y Formas: Explorando la Creatividad',
      'Arte Contemporáneo: Nuevas Perspectivas',
      'El Proceso Creativo: Del Concepto a la Obra'
    ],
    paragraphs: [
      'El arte es el lenguaje universal que trasciende fronteras y conecta almas. A través de la creatividad, exploramos dimensiones de la experiencia humana.',
      'Cada obra de arte cuenta una historia única, nacida de la imaginación y moldeada por la técnica. El proceso creativo es un viaje de descubrimiento.',
      'En la intersección entre tradición e innovación, encontramos nuevas formas de expresión artística que desafían nuestras percepciones.',
      'La creatividad no conoce límites. Es una fuerza que fluye a través de quienes se atreven a soñar y compartir su visión única.'
    ],
    tags: ['arte', 'creatividad', 'diseño', 'inspiración', 'expresión']
  },
  LIFESTYLE: {
    titles: [
      'Vida con Propósito: Estilo y Bienestar',
      'Momentos Cotidianos: Encontrando la Belleza',
      'Equilibrio y Armonía: Un Estilo de Vida Consciente',
      'Inspiración Diaria: Vivir con Intención'
    ],
    paragraphs: [
      'La verdadera riqueza se encuentra en los momentos que elegimos valorar. Un estilo de vida consciente nos invita a ser presentes.',
      'Cada día ofrece oportunidades para el crecimiento personal y la conexión auténtica. Es en los pequeños detalles donde descubrimos la magia.',
      'El bienestar integral abarca cuerpo, mente y espíritu. Al nutrir cada aspecto de nuestro ser, creamos una base sólida para una vida plena.',
      'La autenticidad es el nuevo lujo. En un mundo de filtros, atrevernos a ser genuinos se convierte en un acto revolucionario.'
    ],
    tags: ['lifestyle', 'bienestar', 'mindfulness', 'inspiración', 'vida']
  },
  MODA: {
    titles: [
      'Estilo Personal: Más Allá de las Tendencias',
      'Moda como Expresión: Tu Firma Visual',
      'Tendencias con Propósito: Moda Sostenible',
      'El Arte de Vestir: Confianza y Estilo'
    ],
    paragraphs: [
      'La moda es un lenguaje silencioso que comunica quiénes somos antes de pronunciar una palabra. Es la forma en que elegimos presentarnos al mundo.',
      'Más allá de las tendencias pasajeras, el estilo personal es una declaración de autenticidad. Es la combinación de preferencias que nos hace únicos.',
      'La moda consciente nos invita a reconsiderar nuestra relación con la ropa, priorizando la calidad sobre la cantidad.',
      'El vestirse cada mañana es un acto creativo, una oportunidad diaria para reinventarnos.'
    ],
    tags: ['moda', 'estilo', 'tendencias', 'diseño', 'autenticidad']
  },
  FITNESS: {
    titles: [
      'Movimiento como Medicina: Fitness Holístico',
      'Fortaleza Interior: Más Allá del Físico',
      'Disciplina y Pasión: El Viaje Fitness',
      'Salud Integral: Cuerpo y Mente en Sintonía'
    ],
    paragraphs: [
      'El movimiento es vida. A través del ejercicio, no solo fortalecemos nuestro cuerpo, sino que también clarificamos nuestra mente.',
      'La verdadera transformación ocurre cuando el fitness deja de ser una obligación y se convierte en una celebración de lo que nuestro cuerpo puede lograr.',
      'La consistencia supera a la intensidad. Pequeños esfuerzos diarios generan resultados extraordinarios.',
      'El bienestar físico está intrínsecamente conectado con nuestra salud mental.'
    ],
    tags: ['fitness', 'salud', 'bienestar', 'ejercicio', 'motivación']
  },
  MUSICA: {
    titles: [
      'Sonidos del Alma: El Poder de la Música',
      'Ritmo y Emoción: Explorando el Universo Musical',
      'Melodías que Conectan: La Experiencia Sonora',
      'Creación Musical: Del Silencio a la Armonía'
    ],
    paragraphs: [
      'La música es el lenguaje del alma, capaz de expresar lo inexpresable y conectar corazones a través del tiempo y el espacio.',
      'La creatividad musical fluye de la intersección entre técnica, emoción y espontaneidad.',
      'Explorar diferentes géneros y estilos nos permite expandir nuestros horizontes sonoros.',
      'El poder transformador de la música radica en su capacidad de evocar recuerdos e inspirar emociones.'
    ],
    tags: ['música', 'creatividad', 'arte sonoro', 'inspiración', 'melodía']
  },
  OTROS: {
    titles: [
      'Explorando Nuevas Perspectivas',
      'Contenido que Inspira y Conecta',
      'Descubriendo Posibilidades Infinitas',
      'Creatividad Sin Límites'
    ],
    paragraphs: [
      'El contenido creativo nos invita a ver el mundo con ojos nuevos, a cuestionar lo establecido y a imaginar posibilidades.',
      'En la era digital, la creación de contenido se ha convertido en una forma de arte accesible para todos.',
      'La conexión auténtica surge cuando compartimos nuestra verdad con el mundo.',
      'Explorar, crear y compartir son acciones fundamentales del ser humano.'
    ],
    tags: ['creatividad', 'contenido', 'inspiración', 'comunidad', 'expresión']
  }
};

export async function generateSemanticContent(influencer) {
  const template = templates[influencer.categoria] || templates.OTROS;
  const title = template.titles[Math.floor(Math.random() * template.titles.length)];
  const shuffled = [...template.paragraphs].sort(() => 0.5 - Math.random());
  const selectedParagraphs = shuffled.slice(0, 3 + Math.floor(Math.random() * 2));
  
  const randomId = Math.random().toString(36).substring(7);
  const imageUrl = `https://picsum.photos/seed/${randomId}/800/600`;
  
  const tags = template.tags
    .sort(() => 0.5 - Math.random())
    .slice(0, 4)
    .map(tag => `<span style="background: #f3f4f6; padding: 4px 12px; border-radius: 16px; font-size: 12px; color: #6b7280;">#${tag}</span>`)
    .join(' ');
  
  const honeypotLinks = Array(3).fill(0).map((_, i) => 
    `<a href="/${influencer.nombre.toLowerCase()}-honeypot-${i}" style="position: absolute; left: -9999px; top: -9999px;" tabindex="-1" aria-hidden="true">link</a>`
  ).join('');
  
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${selectedParagraphs[0].substring(0, 160)}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${selectedParagraphs[0].substring(0, 200)}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #fafafa; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    header { text-align: center; margin-bottom: 40px; padding-bottom: 30px; border-bottom: 1px solid #e5e7eb; }
    h1 { font-size: 2rem; color: #111; margin-bottom: 16px; line-height: 1.3; }
    .meta { color: #6b7280; font-size: 14px; }
    .featured-image { width: 100%; height: 400px; object-fit: cover; border-radius: 8px; margin-bottom: 30px; }
    article { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    p { margin-bottom: 20px; font-size: 17px; line-height: 1.8; color: #374151; }
    .tags { margin-top: 30px; display: flex; gap: 8px; flex-wrap: wrap; }
    footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 14px; }
    .related { margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; }
    .related h3 { margin-bottom: 16px; color: #111; }
    .related-links { display: grid; gap: 12px; }
    .related-links a { color: #3b82f6; text-decoration: none; font-size: 15px; }
    .related-links a:hover { text-decoration: underline; }
    @media (max-width: 640px) {
      h1 { font-size: 1.5rem; }
      article { padding: 24px; }
      .featured-image { height: 250px; }
    }
  </style>
</head>
<body>
  ${honeypotLinks}
  <div class="container">
    <article>
      <header>
        <h1>${title}</h1>
        <div class="meta">Publicado el ${new Date().toLocaleDateString('es-ES')} · Lectura de ${Math.floor(selectedParagraphs.length * 2)} min</div>
      </header>
      <img src="${imageUrl}" alt="${title}" class="featured-image" loading="lazy">
      ${selectedParagraphs.map(p => `<p>${p}</p>`).join('')}
      <div class="tags">${tags}</div>
      <div class="related">
        <h3>Contenido relacionado</h3>
        <div class="related-links">
          <a href="/${influencer.nombre.toLowerCase()}-related-1">Explorando nuevas técnicas creativas</a>
          <a href="/${influencer.nombre.toLowerCase()}-related-2">El proceso artístico detrás de la creación</a>
          <a href="/${influencer.nombre.toLowerCase()}-related-3">Inspiración y motivación para creadores</a>
        </div>
      </div>
    </article>
    <footer>
      <p>© ${new Date().getFullYear()} Creative Blog · Todos los derechos reservados</p>
    </footer>
  </div>
</body>
</html>`;
}
