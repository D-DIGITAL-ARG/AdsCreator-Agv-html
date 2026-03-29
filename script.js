const GROQ_API_KEY = typeof CONFIG !== 'undefined' ? CONFIG.GROQ_API_KEY : '';
const FLOW_API_KEY = typeof CONFIG !== 'undefined' ? CONFIG.FLOW_API_KEY : '';
const HUGGING_API_KEY = typeof CONFIG !== 'undefined' ? CONFIG.HUGGING_API_KEY : '';

const api = {
    async analyze(url) {
        console.log(`Analyzing website (Standalone): ${url}`);

        const proxyTemplates = [
            (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
            (u) => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(u)}`,
            (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
            (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}&cachebust=${Date.now()}`
        ];

        let html = null;
        let lastError = null;
        const currentIdx = 0;
        const searchOrder = [
            currentIdx,
            ...Array.from({ length: proxyTemplates.length }, (_, i) => i).filter(i => i !== currentIdx)
        ];

        for (const idx of searchOrder) {
            try {
                const proxyUrl = proxyTemplates[idx](url);
                console.log(`Trying Proxy #${idx}: ${proxyUrl.substring(0, 70)}...`);
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Status ${response.status}`);
                const text = await response.text();
                let candidateHtml = text;

                if (text.trim().startsWith('{')) {
                    try {
                        const data = JSON.parse(text);
                        candidateHtml = data.contents || text;
                    } catch (e) { }
                }

                if (candidateHtml && candidateHtml.trim().length > 100) {
                    html = candidateHtml;
                    console.log(`✅ Success with Proxy #${idx}`);
                    break;
                }
            } catch (e) {
                console.warn(`❌ Proxy #${idx} failed: ${e.message}`);
                lastError = e;
            }
        }

        if (!html) throw new Error(`Error: ${lastError?.message || 'Bloqueo de seguridad'}`);

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const getAbs = (s) => {
            try { return new URL(s, url).href; } catch (e) { return null; }
        };

        const getImageSize = (imgUrl) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = async () => {
                    try {
                        await img.decode();
                        resolve({ w: img.naturalWidth, h: img.naturalHeight });
                    } catch (e) {
                        resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
                    }
                };
                img.onerror = () => resolve({ w: 0, h: 0 });
                img.src = imgUrl;
                setTimeout(() => resolve({ w: 0, h: 0 }), 3500);
            });
        };

        // --- Extracción de Metadatos ---
        const title = doc.title || '';
        console.log(`MetaDatos Título: ${title}`);

        // --- Extracción Avanzada de Imágenes ---
        const metaImage = doc.querySelector('meta[property="og:image"]')?.content ||
            doc.querySelector('meta[name="twitter:image"]')?.content ||
            doc.querySelector('link[rel="apple-touch-icon"]')?.href;

        const imgElements = Array.from(doc.querySelectorAll('img'));
        const imagePromises = imgElements.map(async (img) => {
            const srcAttr = img.getAttribute('src') ||
                img.getAttribute('data-src') ||
                img.getAttribute('data-lazy-src');
            img.getAttribute('srcset')?.split(',')[0].split(' ')[0];

            const absUrl = getAbs(srcAttr);
            if (!absUrl) return null;

            const realSize = await getImageSize(absUrl);

            return {
                url: absUrl,
                html: img.outerHTML.toLowerCase(),
                Ancho: realSize.w,
                Alto: realSize.h,
                Width: parseInt(img.getAttribute('width') || 0),
                Height: parseInt(img.getAttribute('height') || 0)
            };
        });

        const results = (await Promise.all(imagePromises)).filter(item => item !== null);

        // --- Filtrado Final ---
        const detectedImages = results
            .filter(item => {
                const html = item.html;
                const src = item.url;
                const lower = src.toLowerCase();

                if (lower.endsWith('.svg') || lower.endsWith('.ico') || lower.endsWith('.gif')) return false;
                const badTerms = ['pixel', 'bono', 'boton', 'secure', 'certificado', 'logo', 'resena', 'tracker', 'facebook.com/tr', 'precio', 'hotmart', 'garantia', 'wp-smiley', 'testimonio'];
                if (badTerms.some(term => lower.includes(term) || item.html.includes(term))) return false;
                if (html.includes('class="wp-smiley"') || html.includes('attachment-thumbnail')) return false;
                if (item.Width < 250 && item.Ancho < 250) return false;
                if (item.Height < 150 && item.Alto < 150) return false;
                if (item.Alto > 0) {
                    const ratio = item.Ancho / item.Alto;
                    if (ratio > 2.5) return false;
                }

                console.log(`Width: ${item.Width}px | Height: ${item.Height}px | Ancho: ${item.Ancho}px | Alto: ${item.Alto}px | URL: ${item.url}`);
                return src.startsWith('http');
            })
        .map(item => item.url)
        .slice(0, 15);
        console.log(`Detectadas ${detectedImages.length} imágenes relevantes`);


const analisisPrompt = `Actúa como un analista experto en marketing digital, creador de contenido y copywriting senior. Tu objetivo es realizar un web scraping y análisis profundo de la url proporcionada por el usuario para extraer insumos y activos visuales que permitan crear anuncios de alto impacto. Devuelve un objeto JSON con el análisis detallado en español, el JSON debe tener exactamente la siguiente estructura y contenido:

1. Identidad_Visual:
• Paleta_de_Colores: Identifica los colores principales, secundarios y de acento. Describe la psicología que transmiten (calma, urgencia, sofisticación, motivación).
• Tipografía: Analiza el estilo de las fuentes (modernas, clásicas, ligeras, pesadas, decorativas, elegantes).
• Estilo_de_Imágenes: Identifica los estilos de las imágenes (acuarela, impresionismo, surrealismo, gótico, minimalismo, fotorrealismo, cyberpunk, ilustración infantil, renderizado 3D, caricatura, Pixar, Dreamworks).
• Composición: Analiza la composición del contenido visual.
• Atmósfera_General: Analiza el diseño (editorial de alta gama, minimalista, saturado, funcional, alegre, divertido, educativo).

2. Extracción_y_Analisis_de_Texto:
• Contenido_Textual: Extrae los títulos principales y llamadas a la acción (CTA).
• Propuesta_de_Valor: Define el beneficio central único que ofrece la marca.
• Beneficios: Traduce 3 características técnicas en beneficios reales usando el método ¿Y qué?.
• Tono_de_Voz: Determina si la comunicación es cercana, profesional, inspiradora o urgente.
• Fórmulas_de_Persuasión: Detecta si utilizan estructuras como PAS (Problema, Agitación, Solución) u otras como AIDA.

3. Buyer_Persona_y_Estrategia:
• Cliente_Ideal: Descripción semificticia del cliente ideal basada en el texto del sitio.
• Puntos_de_dolor: Lista de problemas o frustraciones que el sitio busca resolver.
• Metas_y_deseos: Qué aspira lograr el cliente con este producto/servicio.
• Etapa_del_Embudo: Identifica si el sitio está optimizado para la etapa de conciencia, consideración o conversión.

Restricciones y Guías Adicionales:
1. Precisión: No inventes datos; si una información no es detectable, indica 'no detectado'.
2. Claridad: El lenguaje debe ser profesional y directo, evitando redundancias.
3. IMPORTANTE SOBRE IMÁGENES: Para la sección 'Identidad_Visual' y 'Estilo_de_Imágenes', limítate exclusivamente a analizar las URLs proporcionadas en la lista 'Imágenes Detectadas'. Ignora cualquier otra referencia visual del sitio que no esté en esa lista para evitar inconsistencias.
4. Idioma: Toda la respuesta debe ser en español.
5. JSON Estricto: Asegurate de que la salida sea un JSON válido para que pueda ser procesado por mi aplicación sin errores de formato.
6. Responde ÚNICAMENTE con el objeto JSON, sin introducciones ni comentarios adicionales.

Objetivo final: Que luego actúes como un estratega de contenido y utilices toda la información obtenida para generar prompts efectivos para crear imágenes y textos de anuncios que mantengan una coherencia total con este sitio web.`;

const bodyClone = doc.body.cloneNode(true);
const tagsToRemove = ['script', 'style', 'noscript', 'iframe', 'header', 'footer', 'nav', 'svg'];
tagsToRemove.forEach(tag => {
    bodyClone.querySelectorAll(tag).forEach(el => el.remove());
});

const rawText = bodyClone.innerText
    .replace(/\s+/g, ' ') 
    .replace(/(menu|close|abrir|cerrar|scroll)\b/gi, ' ')
    .trim();

const bodyContent = rawText.lastIndexOf('.', 2100) !== -1 
    ? rawText.substring(0, rawText.lastIndexOf('.', 2100) + 1) 
    : rawText.substring(0, 2100);

const imagenesParaAnalizar = detectedImages.map((url, index) => `Imagen ${index + 1}: ${url}`).join('\n');

const systemPrompt = `${analisisPrompt}`.trim().substring(0, 4500);
const userPrompt = `URL del sitio: ${url}
Imágenes Detectadas:
${imagenesParaAnalizar}`.trim().substring(0, 3000);

        console.log(`Arma Prompts de Análisis: `, systemPrompt, userPrompt);
        console.log(`Envia solicitud para generar Analisis`);

        try {
            const rawResult = await this.callText(systemPrompt, userPrompt);
            const cleanResult = rawResult.replace(/```json|```/g, '').trim();
            const json = this.safeJsonParse(cleanResult);
            if (!json) throw new Error("JSON Parse Error");
            json.Contenido_Web = bodyContent;
            json.Imagenes_Detectadas = detectedImages;
            console.log(`Convierte respuesta a Json y retorna datos. `, json);
            return json;
        } catch (e) {
            throw new Error(`Error en análisis de IA: ${e.message}`);
        }
    },

async callText(systemPrompt, userPrompt) {
    console.log(`Obtiene textos de Prompts`);
    
    try {        
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        console.log('Fetch de analisis a Groq: ');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
		'Content-Type': 'application/json'
	            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [
               {
		role: 'system', 
		content: systemPrompt
		},
		{
      		role: 'user',
      		content: userPrompt
    		}
		],
                temperature: 0.7,
                max_tokens: 2048,
                top_p: 1,
                stream: false,
		stop: null
            })
        });
	
        if (!response.ok) throw new Error(`API de Texto respondió con status ${response.status}`);
	const data = await response.json();
	console.log("Respuesta de analisis de Groq: ", data);
        return data.choices[0].message.content;

    } catch (e) {
        console.error("Error en el proceso de texto:", e.message);
        throw new Error(`Fallo en conexión con API Text: ${e.message}`);
    }
},

async callAds(systemPrompt, userPrompt, userImg) {
    console.log(`Obtiene datos de Prompts`);
    
try {        
     const url = 'https://api.groq.com/openai/v1/chat/completions';
     console.log('Fetch de ads a Groq: ');

const response = await fetch(url, {
    method: 'POST', 
    headers: {
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`, 
        'Content-Type': 'application/json' 
    },
    body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct', 
        messages: [
            {
                role: 'system',
                content: systemPrompt
            },
            {
                role: 'user',
                content: [
                    { type: 'text', text: userPrompt },
                    { type: 'image_url', image_url: { url: userImg } }
                ]
            }
        ],
        temperature: 0.7,
        max_tokens: 2048
    })
});

        if (!response.ok) throw new Error(`Error de API ${response.status}`);
	const data = await response.json();
	console.log('Respuesta de Ads de Groq: ', data);
        return data.choices[0].message.content;

    } catch (e) {
        throw new Error(`Fallo en conexión con API Vision: ${e.message}`);
    }
},

async generateCopy(websiteData, existingAds = []) {
    try {
const adsPrompt = `Actua como un Director Creativo y Copywriter Senior experto en marketing de respuesta directa. Tu misión es analizar la información proporcionada en el 'Análisis Previo' y 'Contenido web' y crear 2 variantes de anuncios de alto impacto diseñados para generar un freno del scroll inmediato.

Genera un objeto JSON estricto en español con 2 variantes de anuncios en un array llamado "ads".
Responde ÚNICAMENTE con el objeto JSON, sin introducciones ni comentarios adicionales.
Cada anuncio dentro del array "ads" debe tener EXACTAMENTE esta estructura:
{
      "headline": "Título gancho (Hook) entre 4 y 6 palabras",
      "caption": "Cuerpo del texto principal (3-5 frases directas apuntando a puntos de dolor)",
      "image_prompt": "Prompt para la generación de imagen, que cumpla estrictamente con las siguientes reglas: 

1. Deben estar escritos siempre en inglés.

2. Para la primer variante actúa como un analista experto en diseño visual y especialista en ingeniería de prompts. Tu tarea es realizar un análisis exhaustivo de la imagen adjunta para redactar un prompt altamente preciso para crear una imagen a partir de una imagen.

Sigue estos pasos:

Análisis de Estilo Visual: Identifica la paleta de colores dominante, la iluminación (ej. luz natural, cinemática, neón), la composición, el medio artístico (ej. fotografía hiperrealista, ilustración digital, acuarela) y la atmósfera general (ej. minimalista, sofisticada, caótica).

Identificación de Elementos: Describe con detalle el sujeto principal, los objetos secundarios, el fondo y cualquier detalle textural clave presente en la imagen.

Generación del Prompt Final: Redacta un prompt, de al menos 500 caracteres, para generar una imagen aplicando el Estilo Visual, la nueva imagen incorpora los elementos identificados en una nueva escena, diferente y creativa. Incluye palabras clave técnicas que refuercen la calidad visual.
 
3. Para la segunda variante actúa como un analista experto y especialista en ingeniería de prompts. Tu tarea es analizar detalladamente la información proporcionada en el Análisis Previo, Contenido web y Estilo Visual para redactar un prompt altamente preciso para crear una imagen a partir de texto.

Generación del Prompt Final: Redacta un prompt, de al menos 500 caracteres, combinando la información obtenida del Análisis Previo, Contenido web y Estilo Visual para crear una imagen publicitaria. Asegúrate de incluir palabras clave técnicas que refuercen la calidad visual."}`;

const existingContext = existingAds.length > 0 
? `\nNo repitas esto: ${existingAds.map(ad => ad.headline).join(', ')}` : '';

const systemPrompt = `${adsPrompt}
`.trim().substring(0, 3500);
const userPrompt = `
Análisis Previo:
${JSON.stringify(websiteData.Extracción_y_Analisis_de_Texto)}
Contenido web:
${websiteData.Contenido_Web}
Estilo Visual:
${JSON.stringify(websiteData.Identidad_Visual)}`.trim().substring(0, 6000);
const userImg = selectedImage;

	console.log(`Arma Prompts para Ads: `, userImg, systemPrompt, userPrompt);
	console.log(`Envia solicitud para generar copys Ads`);

        const rawResult = await this.callAds(systemPrompt, userPrompt, userImg);
        const cleanResult = rawResult.replace(/```json|```/g, '').trim();
        let json = this.safeJsonParse(cleanResult);

            if (json) {
                if (Array.isArray(json)) {
                    json = { ads: json };
                } else if (json.variants && !json.ads) {
                    json.ads = json.variants;
                } else if (!json.ads) {
                    const possibleArray = Object.values(json).find(v => Array.isArray(v));
                    if (possibleArray) json.ads = possibleArray;
                    console.log(`Ads array: `, possibleArray);
                }
            }

        console.log(`Copys y prompts generados correctamente con coherencia de marca`, json);
	return json || { ads: [] };
    	} catch (e) {
        	throw new Error(`Fallo al generar copy: ${e.message}`);
    	}
},

async generateImage(prompt, imagenOk) {
    console.log("Imagen de referencia:", imagenOk);
    const url = 'https://api.siliconflow.com/v1/images/generations';

	let bodyData = {
        	prompt: prompt,
        	image_size: '1024x1024',
        	batch_size: 1,
        	prompt_enhancement: false
		};

	if (imagenOk) {
        	bodyData.model = 'black-forest-labs/FLUX.1-Kontext-dev';
        	bodyData.image = imagenOk;
		bodyData.strength = 0.1;
        } else {
        	bodyData.model = 'black-forest-labs/FLUX.1-schnell';
        	bodyData.num_inference_steps = 4;
	}

    try {
	console.log(`Solicitando edición a FLOW (${bodyData.model}) con prompt:`, prompt);
	const response = await fetch(url, {
            	method: 'POST',
		headers: {
        	'Authorization': `Bearer ${CONFIG.FLOW_API_KEY}`,
        	'Content-Type': 'application/json'	},
	        body: JSON.stringify(bodyData)
        });

        if (!response.ok) {
            const errorDetail = await response.json();
            throw new Error(`Error Flow: ${errorDetail.message || response.statusText}`);
        }

        const data = await response.json();
	const generatedImageUrl = data.images?.[0]?.url || data.data?.[0]?.url || data.images?.[0];

        if (!generatedImageUrl) throw new Error("No se encontró la URL de la imagen");

        return { url: generatedImageUrl };

    } catch (err) {
        console.error("Fallo total en la generación de imagen:", err.message);
        return null;
    }
},

async getImageAsDataUrl(url) {
        if (!url) return null;
        const proxies = [
            (u) => u, // Direct
            (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
            (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
            (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
        ];

        for (const proxyFn of proxies) {
            try {
                const targetUrl = proxyFn(url);
                const resp = await fetch(targetUrl);
                if (!resp.ok) continue;

                let blob;
                if (targetUrl.includes('allorigins')) {
                    const json = await resp.json();
                    const blobResp = await fetch(json.contents);
                    blob = await blobResp.blob();
                } else {
                    blob = await resp.blob();
                }

                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.warn(`Fetch with proxy failed:`, e);
            }
        }
        return null;
    },

 async composeAdImage(backgroundUrl, overlayUrl) {
        const bgData = await this.getImageAsDataUrl(backgroundUrl);
        const overlayData = overlayUrl ? await this.getImageAsDataUrl(overlayUrl) : null;

        if (!bgData) throw new Error("Could not load background image");

        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d');

            const bgImg = new Image();
            bgImg.onload = () => {
                ctx.drawImage(bgImg, 0, 0, 1024, 1024);

                if (overlayData) {
                    const overlayImg = new Image();
                    overlayImg.onload = () => {
                        // Logic: Maintain aspect ratio (object-contain)
                        const targetSize = 1024 * 0.6;
                        let drawWidth, drawHeight;
                        const imgRatio = overlayImg.width / overlayImg.height;

                        if (imgRatio > 1) { // Landscape
                            drawWidth = targetSize;
                            drawHeight = targetSize / imgRatio;
                        } else { // Portrait or Square
                            drawHeight = targetSize;
                            drawWidth = targetSize * imgRatio;
                        }

                        const x = (1024 - drawWidth) / 2;
                        const y = (1024 - drawHeight) / 2;

                        ctx.drawImage(overlayImg, x, y, drawWidth, drawHeight);
                        resolve(canvas.toDataURL('image/jpeg', 0.95));
                    };
                    overlayImg.onerror = () => {
                        console.warn("Failed to load overlay DataUrl");
                        resolve(canvas.toDataURL('image/jpeg', 0.95));
                    };
                    overlayImg.src = overlayData;
                } else {
                    resolve(canvas.toDataURL('image/jpeg', 0.95));
                }
            };
            bgImg.onerror = () => reject(new Error("Failed to load background DataUrl"));
            bgImg.src = bgData;
        });
    },

safeJsonParse(text) {
        console.log("Texto a PARSEAR: ", text);
        let content = text;
        try {
            const outer = JSON.parse(text);
            if (outer && outer.result) {
                content = outer.result;
            } else if (outer && typeof outer === 'object') return outer;
        } catch (e) { }

        const clean = content.replace(/```json|```/g, '').trim();
        const match = clean.match(/[\[\{][\s\S]*[\]\}]/);
        if (!match) return null;
        try { return JSON.parse(match[0]); } catch (e) { return null; }
    }
};


// --- REST OF THE UI LOGIC ---
// State
let stage = 'input';
let websiteData = null;
let detectedImages = [];
let selectedImage = null;
let selectedImageIndex = 0;
let currentAds = [];

// DOM Elements
const stages = {
    input: document.getElementById('stage-input'),
    generating: document.getElementById('stage-generating'),
    results: document.getElementById('stage-results')
};

const urlForm = document.getElementById('url-form');
const websiteUrlInput = document.getElementById('website-url');
const progressBar = document.getElementById('progress-bar');
const progressIndicator = document.getElementById('progress-indicator');
const progressPercentage = document.getElementById('progress-percentage');
const currentStepLabel = document.getElementById('current-step-label');
const adsGallery = document.getElementById('ads-gallery');
const urlDisplay = document.getElementById('results-url-display');
const generateMoreBtn = document.getElementById('generate-more-btn');
const resetBtn = document.getElementById('reset-btn');

// UI Transitions
function setStage(newStage) {
    stage = newStage;
    Object.values(stages).forEach(s => {
        if (s) {
            s.classList.remove('active');
            s.classList.add('hidden');
        }
    });
    if (stages[newStage]) {
        stages[newStage].classList.add('active');
        stages[newStage].classList.remove('hidden');
    }
    window.scrollTo(0, 0);
}


function updateProgress(step, total = 4) {
    const percentage = Math.round((step / total) * 100);
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressIndicator) progressIndicator.style.width = `${percentage}%`;
    if (progressPercentage) progressPercentage.textContent = `${percentage}%`;

    const labels = [
        "Analizando contenido del sitio",
        "Estrategia de Marca",
        "Copywriting Persuasivo",
        "Visual Studio"
    ];

    if (currentStepLabel) currentStepLabel.textContent = labels[step] || "Procesando...";

    document.querySelectorAll('.step-item').forEach((el, idx) => {
        const statusIcon = el.querySelector('.step-icon-status');
        const stateLabel = el.querySelector('.step-state');

        el.classList.remove('opacity-100', 'opacity-40');
        if (statusIcon) {
            statusIcon.classList.remove('bg-neon-cyan/20', 'border-neon-cyan/30', 'text-neon-cyan', 'animate-spin', 'border-t-transparent', 'border-2', 'bg-neon-pink/20', 'border-neon-pink');
            statusIcon.classList.add('bg-white/5', 'border-white/10');
        }

        if (idx < step) {
            // Completed
            el.classList.add('opacity-100');
            if (statusIcon) {
                statusIcon.innerHTML = '<span class="material-symbols-outlined text-xl">check_circle</span>';
                statusIcon.classList.add('bg-neon-cyan/20', 'border-neon-cyan/30', 'text-neon-cyan');
            }
            if (stateLabel) {
                stateLabel.textContent = 'Completado';
                stateLabel.classList.remove('text-gray-500', 'animate-pulse', 'text-neon-pink');
                stateLabel.classList.add('text-neon-cyan');
            }
        } else if (idx === step) {
            // Active
            el.classList.add('opacity-100');
            if (statusIcon) {
                statusIcon.innerHTML = '';
                statusIcon.classList.add('border-2', 'border-t-transparent', 'animate-spin', 'border-neon-pink', 'bg-neon-pink/20');
            }
            if (stateLabel) {
                stateLabel.textContent = 'En curso...';
                stateLabel.classList.remove('text-gray-500');
                stateLabel.classList.add('text-neon-pink', 'animate-pulse');
            }
        } else {
            // Pending
            el.classList.add('opacity-40');
            if (stateLabel) {
                stateLabel.textContent = 'Pendiente';
                stateLabel.classList.add('text-gray-500');
            }
        }
    });
}

// Manual Input Elements
const manualInputContainer = document.getElementById('manual-input-container');
const manualTextArea = document.getElementById('manual-text');
const manualImageUrlInput = document.getElementById('manual-image-url');
const submitManualBtn = document.getElementById('submit-manual-btn');
const closeManualBtn = document.getElementById('close-manual-btn');

// Show/Hide Manual Input
function showManualInput() {
    manualInputContainer.classList.remove('hidden');
    manualTextArea.focus();
}

function hideManualInput() {
    manualInputContainer.classList.add('hidden');
    manualTextArea.value = '';
    manualImageUrlInput.value = '';
}

if (closeManualBtn) closeManualBtn.addEventListener('click', hideManualInput);

// Manual Submission Logic
if (submitManualBtn) {
    submitManualBtn.addEventListener('click', async () => {
        const text = manualTextArea.value.trim();
        const manualImageUrl = manualImageUrlInput.value.trim();

        if (text.length < 50) {
            alert('Por favor, ingresa un poco más de información para un mejor resultado.');
            return;
        }

        hideManualInput();
        setStage('generating');
        updateProgress(0);

        try {
            const systemPrompt = "Analiza este texto y entrégame un JSON válido con los detalles de marketing. RESPONDE SIEMPRE EN ESPAÑOL.";
            const userPrompt = `Texto proporcionado: ${text.substring(0, 5000)}
            
            Devuelve JSON EN ESPAÑOL:
            {
              "brand_name": "string",
              "products_services": ["string"],
              "key_benefits": ["string"],
              "target_audience": "string",
              "brand_tone": "string",
              "emotional_tone": "string",
              "visual_style": "string",
              "main_promise": "string"
            }`;

            const rawResult = await api.callText(systemPrompt);
            websiteData = api.safeJsonParse(rawResult);
            console.log(`Datos del sitio`, websiteData);

            if (!websiteData) throw new Error("No se pudo analizar el texto manual");

            detectedImages = manualImageUrl ? [manualImageUrl] : [];
            selectedImage = manualImageUrl || null;
            updateProgress(1);

            if (urlDisplay) urlDisplay.textContent = `Análisis Manual`;
            await startGeneration();
        } catch (error) {
            console.error(error);
            alert('Fallo al procesar el texto: ' + error.message);
            setStage('input');
        }
    });
}

// Logic: Analysis & Generation
if (urlForm) {
    urlForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = websiteUrlInput.value;
        if (!url) return;

        setStage('generating');
        updateProgress(0);

        try {
            websiteData = await api.analyze(url);
            detectedImages = websiteData.Imagenes_Detectadas || [];
            selectedImageIndex = 0;
            selectedImage = detectedImages.length > 0 ? detectedImages[0] : null;
            updateProgress(1);

            if (urlDisplay) urlDisplay.textContent = `URL: ${url}`;
            await startGeneration();

            } catch (error) {
            console.error(error);
            setStage('input');

            if (error.message.includes('fetch') || error.message.includes('acceder') || error.message.includes('Proxy')) {
                const retry = confirm(`${error.message}\n\n¿Quieres intentar ingresar el contenido manualmente?`);
                if (retry) {
                    showManualInput();
                }
            } else {
                alert('Hubo un error al analizar el sitio: ' + error.message);
            }
        }
    });
}

async function startGeneration() {
    updateProgress(2);
    try {
        const adCopy = await api.generateCopy(websiteData, 2);
        updateProgress(3);

        currentAds = (adCopy?.ads || []).map(ad => ({
            headline: ad.headline || ad.titulo || "Título no generado",
            caption: ad.caption || ad.texto || "Texto no generado",
            imageUrl: null,
            visualConcept: ad.visual_concept || ad.concepto || "",
            imagePrompt: ad.image_prompt || ad.prompt || ""
        }));

        // Create a list of promises for image generation
        const generationPromises = currentAds.map(async (ad, i) => {
            let promptToUse = ad.imagePrompt;
	    let imagenRef = selectedImage;
            
        try {
		if (i < 1 && imagenRef) {
                    const result = await api.generateImage(promptToUse, imagenRef);
		    ad.imageUrl = (result && result.url) ? result.url : (selectedImage || 'error');
		} else {
                    const result = await api.generateImage(promptToUse);
                    ad.imageUrl = (result && result.url) ? result.url : (selectedImage || 'error');
                }
         } catch (e) {
                    console.error(`Error en generación de imagen ${i}:`, e);
                    ad.imageUrl = selectedImage;
                    ad.productOverlay = null;
                }
            });

        await Promise.all(generationPromises);
        updateProgress(4);
        await new Promise(r => setTimeout(r, 800));
        setStage('results');
        renderAds();

   	} catch (error) {
        	console.error("Error en startGeneration:", error);
		alert("No se pudieron generar los anuncios. Revisa la consola.");
        	setStage('input');
    	}
}

if (generateMoreBtn) {
    	generateMoreBtn.addEventListener('click', async () => {
        setStage('generating');
        updateProgress(0);

        if (detectedImages.length > 0) {
            selectedImageIndex = (selectedImageIndex + 1) % detectedImages.length;
            selectedImage = detectedImages[selectedImageIndex];
            console.log(`Variante de Imagen: Index ${selectedImageIndex}`, selectedImage);
        }

        try {
            updateProgress(2);
            const adCopy = await api.generateCopy(websiteData, 2, currentAds);
            updateProgress(3);

            const newAdsBase = (adCopy?.ads || []).map(ad => ({
                headline: ad.headline || ad.titulo || "Título no generado",
                caption: ad.caption || ad.texto || "Texto no generado",
                imageUrl: null,
                visualConcept: ad.visual_concept || ad.concepto || "",
                imagePrompt: ad.image_prompt || ad.prompt || ""
            }));

            // Generate images for new ads
            const newGenerationPromises = newAdsBase.map(async (ad, i) => {
            let promptToUse = ad.imagePrompt;
  	    let imagenRef = selectedImage;

            try {
                if (i < 1 && imagenRef) {
                     const result = await api.generateImage(promptToUse, imagenRef);
                     ad.imageUrl = result.url;
                     console.log(`Prompt de Variante Img-Img: `, promptToUse);
		 } else {
                     const result = await api.generateImage(promptToUse);
                     ad.imageUrl = result.url;
                     console.log(`Prompt de Variante Tex-Img: `, promptToUse);
                 }
             } catch (e) {
                    console.error(`Error en generación de imagen ${i}:`, e);
                    ad.imageUrl = imagenRef;
                    ad.productOverlay = null;
                }
            });

            await Promise.all(newGenerationPromises);
            currentAds = [...currentAds, ...newAdsBase];
            updateProgress(4);
            await new Promise(r => setTimeout(r, 800));
            setStage('results');
            renderAds();

        } catch (error) {
        	console.error("Error en startGeneration:", error);
		alert("No se pudieron generar los anuncios. Revisa la consola.");
        	setStage('input');
        }
    });
}

if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        websiteUrlInput.value = '';
        currentAds = [];
        websiteData = null;
        selectedImage = null;
        setStage('input');
    });
}

function renderAds() {
    if (!adsGallery) return;
    adsGallery.innerHTML = '';
    const template = document.getElementById('ad-card-template');

    currentAds.forEach(ad => {
        const clone = template.content.cloneNode(true);
        if (ad.imageUrl === 'error') {
            clone.querySelector('.image-placeholder').innerHTML = '<span class="material-symbols-outlined text-neon-pink">error</span>';
        } else if (ad.imageUrl) {
            const img = clone.querySelector('.ad-img');
            img.src = ad.imageUrl;
            img.classList.remove('hidden');
            clone.querySelector('.image-placeholder').classList.add('hidden');

            if (ad.productOverlay) {
                const overlayImg = clone.querySelector('.product-overlay');
                if (overlayImg) {
                    overlayImg.src = ad.productOverlay;
                    overlayImg.classList.remove('hidden');
                }
            }
        }

        clone.querySelector('.ad-headline').textContent = ad.headline;
        clone.querySelector('.ad-caption').textContent = ad.caption;

        clone.querySelector('.copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(`${ad.headline}\n\n${ad.caption}`);
            const toast = document.getElementById("toast");
            toast.classList.add("show");
            setTimeout(() => {
                toast.classList.remove("show");
            }, 3000);
        });

        clone.querySelector('.download-btn').addEventListener('click', async (e) => {
            if (!ad.imageUrl || ad.imageUrl === 'error') return;

            const btn = e.currentTarget;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span><span>Procesando...</span>';
            btn.disabled = true;

            try {
                let finalUrl = ad.imageUrl;
                if (ad.productOverlay) {
                    try {
                        finalUrl = await api.composeAdImage(ad.imageUrl, ad.productOverlay);
                    } catch (err) {
                        console.error("Composite failed, using background only", err);
                    }
                }

                const link = document.createElement('a');
                link.href = finalUrl;
                link.download = `ad-${Date.now()}.jpg`;
                link.click();
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });

        adsGallery.appendChild(clone);
    });
}
