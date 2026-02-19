// --- CONFIGURATION & API KEYS ---
const POLLINATIONS_TEXT_KEY = 'sk_2Z4CT1Tk202rvhy3plHCekfCb1iYEn7W';
const POLLINATIONS_IMAGE_KEY = 'sk_niuwukmqzen4hv0DItZ97nPj1AiWJpX5';
const POLLINATIONS_KLEIN_KEY = 'sk_uUkhL7cTzzuLt8vlejeJPXXU7hLc1zRz';

// Utility: API Client (Pure Frontend version)
const api = {
    /**
     * Scrapes website content using a CORS proxy and browser-side parsing.
     */
    async analyze(url) {
        console.log(`🔍 Analyzing website (Standalone): ${url}`);

        // Use AllOrigins proxy to bypass CORS
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Error al acceder al sitio web a través del proxy');

        const data = await response.json();
        const html = data.contents;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Extract basic info
        const title = doc.title || '';
        const description = doc.querySelector('meta[name="description"]')?.content || '';
        const keywords = doc.querySelector('meta[name="keywords"]')?.content || '';
        const innerText = doc.body.innerText.replace(/\s+/g, ' ').substring(0, 15000);

        // Extract images
        const detectedImages = Array.from(doc.images)
            .filter(img => {
                const src = img.getAttribute('src');
                if (!src) return false;
                // Basic filter for "real" images
                return src.startsWith('http') || src.startsWith('/');
            })
            .map(img => {
                let src = img.getAttribute('src');
                // Convert relative URLs to absolute
                if (src.startsWith('/')) {
                    const urlObj = new URL(url);
                    src = `${urlObj.origin}${src}`;
                }
                return src;
            })
            .slice(0, 10);

        // Use Pollinations to analyze the extracted text
        const systemPrompt = "Analiza este texto del sitio web y entrégame un JSON válido. RESPONDE SIEMPRE EN ESPAÑOL. Incluye: nombre de marca, beneficios, colores primarios/secundarios, tono emocional y concepto visual.";
        const userPrompt = `
            URL: ${url}
            Title: ${title}
            Desc: ${description}
            Content: ${innerText.substring(0, 800)}

            Analiza y devuelve JSON EN ESPAÑOL:
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

        const rawResult = await this.callText(systemPrompt, userPrompt);
        const json = this.safeJsonParse(rawResult);

        if (!json) throw new Error("No se pudo analizar el contenido de la web");

        json.detected_images = detectedImages;
        return json;
    },

    async callText(systemPrompt, userPrompt) {
        const combined = `${systemPrompt}\n${userPrompt}`.replace(/\s+/g, ' ').trim().substring(0, 1500);
        const encoded = encodeURIComponent(combined);
        const url = `https://gen.pollinations.ai/text/${encoded}?model=gemini-fast&json=true`;

        const response = await fetch(url, {
            headers: {
                'Accept': '*/*',
                'Authorization': `Bearer ${POLLINATIONS_TEXT_KEY}`
            }
        });

        if (!response.ok) throw new Error('Error en la API de Texto');
        return await response.text();
    },

    async generateCopy(websiteData, count = 3, exclude = []) {
        const systemPrompt = `Crea ${count} conceptos de anuncios creativos y PERSUASIVOS.
        RESPONDE SIEMPRE EN ESPAÑOL (excepto image_prompt que debe ser en inglés).
        Usa marcos de marketing como AIDA o PAS.
        
        Para cada anuncio entrega:
        1. headline: Un gancho poderoso (max 6 palabras).
        2. caption: Copy de ventas persuasivo (2-3 frases).
        3. visual_concept: Descripción corta del estilo visual.
        4. image_prompt: Descripción detallada EN INGLÉS para generación de imágenes.
        
        IMPORTANTE: 
        - Para el PRIMER anuncio (index 0), el image_prompt DEBE SER EXACTAMENTE: "Modern ad, premium composition, high-end commercial style, vibrant colors, 1:1 social media ad format. The ad must include the image."
        - Para el resto de los anuncios, crea prompts descriptivos en inglés.
        - Vende el producto. Evita estos conceptos: ${JSON.stringify(exclude)}.`;

        const userPrompt = `Datos de Marca: ${JSON.stringify(websiteData).substring(0, 800)}. Tarea: Crea ${count} conceptos de anuncios NUEVOS en ESPAÑOL.`;

        const rawResult = await this.callText(systemPrompt, userPrompt);
        let json = this.safeJsonParse(rawResult);

        if (json && Array.isArray(json)) json = { ads: json };
        return json;
    },

    async generateImage(prompt, options = {}) {
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

        // Direct fetch to get the image (to return a data URL or just the URL)
        // Note: For standalone browser, we can just return the URL, but to maintain the "dataUrl" behavior:
        const response = await fetch(url, {
            headers: {
                'Accept': '*/*',
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) throw new Error('Error en la API de Imagen');

        const blob = await response.blob();
        return { url: URL.createObjectURL(blob) };
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
        alert('Hubo un error al analizar el sitio: ' + error.message);
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
                console.log('🎨 Generating Variant 0 with KLEIN model');
                options.model = 'klein';
                options.image = selectedImage;
                promptToUse = `Modern ad, premium composition, high-end commercial style, vibrant colors, 1:1 social media ad format. The advertisement must include the image, place it in the center, and reduce its size by half`;
                currentAds[i].visualConcept = 'Anuncio moderno y llamativo';
                renderAds();
            } else {
                options.model = 'flux';
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
