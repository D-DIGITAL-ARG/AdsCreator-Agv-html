// --- CONFIGURATION & API KEYS ---
const POLLINATIONS_TEXT_KEY = 'sk_2Z4CT1Tk202rvhy3plHCekfCb1iYEn7W';
const POLLINATIONS_IMAGE_KEY = 'sk_niuwukmqzen4hv0DItZ97nPj1AiWJpX5';
const POLLINATIONS_KLEIN_KEY = 'sk_uUkhL7cTzzuLt8vlejeJPXXU7hLc1zRz';

// Utility: API Client (Pure Frontend version)
const api = {
    // Persistent memory for the working proxy
    get workingProxyIndex() {
        return parseInt(localStorage.getItem('ads_creator_proxy_idx')) || 0;
    },
    set workingProxyIndex(val) {
        localStorage.setItem('ads_creator_proxy_idx', val);
    },

    /**
     * Scrapes website content using a CORS proxy and browser-side parsing.
     */
    async analyze(url) {
        console.log(`🔍 Analyzing website (Standalone): ${url}`);

        // Define proxies to try
        const proxyTemplates = [
            (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}&cachebust=${Date.now()}`,
            (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
            (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
            (u) => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(u)}`
        ];

        let html = null;
        let lastError = null;

        // Try proxies starting from the last successful one
        const currentIdx = this.workingProxyIndex;
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

                // Handle JSON wrappers (like AllOrigins)
                if (text.trim().startsWith('{')) {
                    try {
                        const data = JSON.parse(text);
                        candidateHtml = data.contents || text;
                    } catch (e) { }
                }

                if (candidateHtml && candidateHtml.trim().length > 100) {
                    html = candidateHtml;
                    this.workingProxyIndex = idx; // Persist success
                    console.log(`✅ Success with Proxy #${idx}`);
                    break;
                }
            } catch (e) {
                console.warn(`❌ Proxy #${idx} failed: ${e.message}`);
                lastError = e;
            }
        }

        if (!html) {
            throw new Error(`No se pudo acceder al sitio web. Error: ${lastError?.message || 'Bloqueo de seguridad'}`);
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Extract metadata
        const title = doc.title || '';
        const description = doc.querySelector('meta[name="description"]')?.content || '';
        const innerText = doc.body.innerText.replace(/\s+/g, ' ').substring(0, 15000);

        // Advanced image extraction
        const getAbs = (s) => {
            try { return new URL(s, url).href; } catch (e) { return null; }
        };

        const metaImage = doc.querySelector('meta[property="og:image"]')?.content ||
            doc.querySelector('meta[name="twitter:image"]')?.content ||
            doc.querySelector('link[rel="apple-touch-icon"]')?.href;

        const imgElements = Array.from(doc.querySelectorAll('img'));
        const rawImages = imgElements.map(img =>
            img.getAttribute('src') ||
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('srcset')?.split(',')[0].split(' ')[0]
        ).filter(Boolean).map(getAbs).filter(Boolean);

        // Combine and prioritize
        const allImages = metaImage ? [getAbs(metaImage), ...rawImages] : rawImages;

        const detectedImages = [...new Set(allImages)]
            .filter(src => {
                const lower = src.toLowerCase();
                // Relaxed filter: include logos unless they are definitely trackers/pixels
                return src.startsWith('http') &&
                    !lower.includes('pixel') &&
                    !lower.includes('tracker') &&
                    !lower.includes('analytics') &&
                    !src.startsWith('data:');
            })
            .slice(0, 15);

        console.log(`📸 Detected ${detectedImages.length} relevant images`);

        // Use Pollinations to analyze the extracted text
        const systemPrompt = "Analiza este texto del sitio web y entrégame un JSON válido. RESPONDE SIEMPRE EN ESPAÑOL. Incluye: nombre de marca, beneficios, colores primarios/secundarios, tono emocional y concepto visual.";
        const userPrompt = `URL: ${url}\nTitle: ${title}\nDesc: ${description}\nContent: ${innerText.substring(0, 1200)}\n\nAnaliza y devuelve JSON EN ESPAÑOL.`;

        try {
            const rawResult = await this.callText(systemPrompt, userPrompt);
            const json = this.safeJsonParse(rawResult);
            if (!json) throw new Error("JSON Parse Error");
            json.detected_images = detectedImages;
            return json;
        } catch (e) {
            throw new Error(`Error en análisis de IA: ${e.message}`);
        }
    },

    async callText(systemPrompt, userPrompt) {
        try {
            const combined = `${systemPrompt}\n${userPrompt}`.replace(/\s+/g, ' ').trim().substring(0, 1500);
            const encoded = encodeURIComponent(combined);
            const url = `https://gen.pollinations.ai/text/${encoded}?model=gemini-fast&json=true`;

            const response = await fetch(url, {
                headers: {
                    'Accept': '*/*',
                    'Authorization': `Bearer ${POLLINATIONS_TEXT_KEY}`
                }
            });

            if (!response.ok) throw new Error(`API de Texto respondió con status ${response.status}`);
            return await response.text();
        } catch (e) {
            console.error("Text API Error:", e);
            throw new Error(`Fallo en conexión con Pollinations Text: ${e.message}`);
        }
    },

    async generateCopy(websiteData, count = 3, exclude = []) {
        try {
            const hasRefImage = !!selectedImage;
            const systemPrompt = `Crea ${count} conceptos de anuncios creativos y PERSUASIVOS.
            RESPONDE SIEMPRE EN ESPAÑOL (excepto image_prompt que debe ser en inglés).
            Usa marcos de marketing como AIDA o PAS.
            
            for cada anuncio entrega:
            1. headline: Un gancho poderoso (MÁXIMO 4 PALABRAS para mejor legibilidad en imagen).
            2. caption: Copy de ventas persuasivo (2-3 frases).
            3. visual_concept: Descripción corta del estilo visual.
            4. image_prompt: Descripción detallada EN INGLÉS para generación de imágenes.
            
            IMPORTANTE SOBRE IMÁGENES: 
            ${hasRefImage ?
                    '- Para el PRIMER anuncio (index 0), el image_prompt DEBE SER EXACTAMENTE: "Modern ad, premium composition, high-end commercial style, vibrant colors, 1:1 social media ad format. The ad must include the image."' :
                    '- Para TODOS los anuncios (incluyendo el index 0), crea prompts descriptivos únicos en inglés basados en el producto.'
                }
            - Para el resto de los anuncios, crea prompts descriptivos en inglés.
            - Usa palabras cortas y directas. Evita estos conceptos: ${JSON.stringify(exclude)}.`;

            const userPrompt = `Datos de Marca: ${JSON.stringify(websiteData).substring(0, 800)}. Tarea: Crea ${count} conceptos de anuncios NUEVOS en ESPAÑOL.`;

            const rawResult = await this.callText(systemPrompt, userPrompt);
            let json = this.safeJsonParse(rawResult);

            if (json && Array.isArray(json)) json = { ads: json };
            return json;
        } catch (e) {
            throw new Error(`Fallo al generar copy publicitario: ${e.message}`);
        }
    },

    async generateImage(prompt, options = {}) {
        try {
            const { width = 1080, height = 1080, model = 'flux', image = null, seed = null } = options;
            const cleanPrompt = prompt.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500);
            const encodedPrompt = encodeURIComponent(cleanPrompt);
            const finalSeed = seed || Math.floor(Math.random() * 1000000);

            let url;
            let apiKey = POLLINATIONS_IMAGE_KEY;

            if (image && model === 'klein') {
                apiKey = POLLINATIONS_KLEIN_KEY;
                const encodedRef = encodeURIComponent(image);
                url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=klein&width=${width}&height=${height}&seed=${finalSeed}&nologo=true&image=${encodedRef}`;
            } else {
                url = `https://gen.pollinations.ai/image/${encodedPrompt}?width=${width}&height=${height}&seed=${finalSeed}&nologo=true&model=flux`;
            }

            const response = await fetch(url, {
                headers: {
                    'Accept': '*/*',
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) throw new Error(`API de Imagen respondió con status ${response.status}`);

            const blob = await response.blob();
            return { url: URL.createObjectURL(blob) };
        } catch (e) {
            console.error("Image API Error:", e);
            throw new Error(`Fallo en conexión con Pollinations Image: ${e.message}`);
        }
    },

    safeJsonParse(text) {
        let content = text;
        try {
            const outer = JSON.parse(text);
            if (outer && outer.result) content = outer.result;
            else if (outer && typeof outer === 'object') return outer;
        } catch (e) { }

        const clean = content.replace(/```json|```/g, '').trim();
        const match = clean.match(/[\[\{][\s\S]*[\]\}]/);
        if (!match) return null;
        try { return JSON.parse(match[0]); } catch (e) { return null; }
    }
};

// --- REST OF THE UI LOGIC (Remains the same as previous scripthome.js) ---

// State
let stage = 'input';
let websiteData = null;
let detectedImages = [];
let selectedImage = null;
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
const adsGallery = document.getElementById('ads-gallery');
const urlDisplay = document.getElementById('results-url-display');
const generateMoreBtn = document.getElementById('generate-more-btn');
const resetBtn = document.getElementById('reset-btn');

// UI Transitions
function setStage(newStage) {
    stage = newStage;
    Object.values(stages).forEach(s => s.classList.remove('active'));
    stages[newStage].classList.add('active');
    window.scrollTo(0, 0);
}

function updateProgress(step, total = 4) {
    const percentage = ((step + 1) / total) * 100;
    progressBar.style.width = `${percentage}%`;

    document.querySelectorAll('.step').forEach((el, idx) => {
        el.classList.remove('active', 'completed');
        const statusEl = el.querySelector('.step-status');

        if (idx < step) {
            el.classList.add('completed');
            statusEl.textContent = 'Completado';
        } else if (idx === step) {
            el.classList.add('active');
            statusEl.textContent = 'En proceso...';
        } else {
            statusEl.textContent = 'Esperando...';
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

closeManualBtn.addEventListener('click', hideManualInput);

// Logic: Analysis & Generation
urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = websiteUrlInput.value;
    if (!url) return;

    setStage('generating');
    updateProgress(0);

    try {
        websiteData = await api.analyze(url);
        detectedImages = websiteData.detected_images || [];
        selectedImage = detectedImages.length > 0 ? detectedImages[0] : null;
        updateProgress(1);

        urlDisplay.textContent = `URL: ${url}`;
        await startGeneration();
    } catch (error) {
        console.error(error);
        setStage('input');

        // If it's a fetch/CORS error, offer manual input
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

// Manual Submission Logic
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
        // Prepare data directly using the text (skip scraping)
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
          "background_color_primary": "hex",
          "background_color_secondary": "hex",
          "button_colors": ["hex"],
          "text_colors": ["hex"],
          "accent_colors": ["hex"],
          "overall_atmosphere": "string",
          "imagery_type": "string",
          "visual_concept": "string"
        }`;

        const rawResult = await api.callText(systemPrompt, userPrompt);
        websiteData = api.safeJsonParse(rawResult);

        if (!websiteData) throw new Error("No se pudo analizar el texto manual");

        detectedImages = manualImageUrl ? [manualImageUrl] : [];
        selectedImage = manualImageUrl || null;
        updateProgress(1);

        urlDisplay.textContent = `Análisis Manual`;
        await startGeneration();
    } catch (error) {
        console.error(error);
        alert('Fallo al procesar el texto: ' + error.message);
        setStage('input');
    }
});

async function startGeneration() {
    updateProgress(2);
    try {
        const adCopy = await api.generateCopy(websiteData, 3);
        updateProgress(3);

        currentAds = adCopy.ads.map(ad => ({
            headline: ad.headline,
            caption: ad.caption,
            imageUrl: null,
            visualConcept: ad.visual_concept,
            imagePrompt: ad.image_prompt
        }));

        renderAds();
        setStage('results');

        for (let i = 0; i < adCopy.ads.length; i++) {
            const ad = adCopy.ads[i];
            let options = { width: 1080, height: 1080, seed: Math.floor(Math.random() * 1000000) };
            let promptToUse = ad.image_prompt;

            if (i === 0 && selectedImage) {
                console.log('🎨 Generating Variant 0 with KLEIN model (Ultra-Strict Text)');
                options.model = 'klein';
                options.image = selectedImage;

                // Use quotes and explicit typography instructions
                promptToUse = `Commercial high-end graphic design. Modern typography layout. 
                    The image must show this text exactly: "${ad.headline}". 
                    Text style: Bold, clean, premium. 
                    Instruction: DO NOT MISSPELL. CHECK CHARACTER BY CHARACTER. NO GIBBERISH.
                    Place the reference image in the center, integrated into the design. 
                    Professional color grading, 1:1 format.`;

                currentAds[i].visualConcept = 'Diseño tipográfico premium';
                renderAds();
            } else {
                // For Flux variants (1 and 2)
                options.model = 'flux';
                promptToUse = `${ad.image_prompt}. 
                    Graphic design with professional typography. 
                    The text "${ad.headline}" must be perfectly spelled and legible. 
                    No extra letters. No gibberish.`;
            }

            try {
                const result = await api.generateImage(promptToUse, options);
                currentAds[i].imageUrl = result.url;
                renderAds();
            } catch (e) {
                console.error('Error generating image', e);
                currentAds[i].imageUrl = 'error';
                renderAds();
            }
        }
    } catch (error) {
        console.error(error);
        setStage('results');
    }
}

generateMoreBtn.addEventListener('click', async () => {
    const currentCount = currentAds.length;
    const existingHeadlines = currentAds.map(ad => ad.headline);
    setStage('generating');
    updateProgress(2);

    try {
        const adCopy = await api.generateCopy(websiteData, 3, existingHeadlines);
        updateProgress(3);

        const newAdsBase = adCopy.ads.map(ad => ({
            headline: ad.headline,
            caption: ad.caption,
            imageUrl: null,
            visualConcept: ad.visual_concept,
            imagePrompt: ad.image_prompt
        }));

        currentAds = [...currentAds, ...newAdsBase];
        renderAds();
        setStage('results');

        for (let i = 0; i < adCopy.ads.length; i++) {
            const adIndex = currentCount + i;
            const ad = adCopy.ads[i];
            let options = { width: 1080, height: 1080, seed: Math.floor(Math.random() * 1000000) };
            let promptToUse = ad.image_prompt;

            if (i === 0 && selectedImage) {
                options.model = 'klein';
                options.image = selectedImage;
                promptToUse = `Modern ad, premium composition, high-end commercial style, vibrant colors, 1:1 social media ad format. The advertisement must include the image, place it in the center, and reduce its size by half`;
                currentAds[adIndex].visualConcept = 'Anuncio moderno y llamativo';
                renderAds();
            } else {
                options.model = 'flux';
            }

            try {
                const result = await api.generateImage(promptToUse, options);
                currentAds[adIndex].imageUrl = result.url;
                renderAds();
            } catch (e) {
                currentAds[adIndex].imageUrl = 'error';
                renderAds();
            }
        }
    } catch (error) {
        setStage('results');
    }
});

resetBtn.addEventListener('click', () => {
    websiteUrlInput.value = '';
    currentAds = [];
    websiteData = null;
    selectedImage = null;
    setStage('input');
});

function renderAds() {
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
        }

        clone.querySelector('.ad-headline').textContent = ad.headline;
        clone.querySelector('.ad-caption').textContent = ad.caption;
        clone.querySelector('.concept-text').textContent = ad.visualConcept;

        clone.querySelector('.copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(`${ad.headline}\n\n${ad.caption}`);
            alert('Texto copiado');
        });

        clone.querySelector('.download-btn').addEventListener('click', () => {
            if (!ad.imageUrl || ad.imageUrl === 'error') return;
            const link = document.createElement('a');
            link.href = ad.imageUrl;
            link.download = `ad-${Date.now()}.jpg`;
            link.click();
        });

        adsGallery.appendChild(clone);
    });
}
