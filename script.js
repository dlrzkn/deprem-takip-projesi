/**
 * SEISMO-PRO CORE & GEOPHYSICAL ENGINE (V4.5)
 * Profesyonel Sismik Analiz ve İzleme Terminali
 */
const SeismoEngine = {
    config: {
        token: 'pk.eyJ1IjoiZGxyemtuIiwiYSI6InN0YW5kYXJkX3Rva2VuIn0.example', // Kendi token'ınızı buraya koyun
        mapStyle: {
            dark: 'mapbox://styles/mapbox/dark-v11',
            light: 'mapbox://styles/mapbox/satellite-streets-v12'
        },
        refreshInterval: 120000,
        plateBoundariesUrl: 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json'
    },
    state: {
        map: null,
        rawEvents: [],
        filteredEvents: [],
        minMag: 0,
        depthFilter: 'all',
        timeRange: 'day',
        isRotating: true,
        currentTheme: 'dark',
        userInteracting: false,
        sortMode: 'time', // 'time', 'mag-desc', 'mag-asc'
        rotationTimeout: null
    },

    init() {
        mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';
        this.state.map = new mapboxgl.Map({
            container: 'map',
            style: this.config.mapStyle.dark,
            center: [35, 39],
            zoom: 2,
            projection: 'globe',
            antialias: true
        });

        this.state.map.on('style.load', () => {
            this.setupAtmosphere();
            this.initSources();
            this.initLayers();
            this.loadPlateBoundaries();
        });

        this.state.map.on('load', () => {
            this.attachEventHandlers();
            this.startDataCycle();
            this.attachUIListeners();
            this.startRotationLoop();
            this.initClock();
        });

        this.setupInteractionDetection();
    }
};


SeismoEngine.normalizeData = function(data, source) {
    // GeoJSON veya JSON dizisi olup olmadığını kontrol et
    const features = data.features || (Array.isArray(data) ? data : []);
    
    return features.map(item => {
        const props = item.properties || item;
        const coords = item.geometry ? item.geometry.coordinates : [item.longitude, item.latitude];
        
        // Kaynağa göre özel ID ve Link yönetimi
        let eventUrl = '#';
        if (source === 'USGS') eventUrl = props.url;
        else if (source === 'EMSC') eventUrl = `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${props.unid}`;

        return {
            id: props.unid || props.ids || props.id || Math.random(),
            mag: parseFloat(props.mag || props.magnitude || 0),
            depth: parseFloat(props.depth || props.depth_mag || 0),
            place: props.place || props.region || props.flynn_region || "Bilinmeyen Bölge",
            time: new Date(props.time || props.m_time).getTime(),
            source: source,
            url: eventUrl,
            coordinates: [parseFloat(coords[0]), parseFloat(coords[1])]
        };
    });
};

SeismoEngine.fetchSeismicData = async function() {
    const statusEl = document.getElementById('connection-status');
    const range = this.state.timeRange;
    
    const endpoints = [
        { id: 'USGS', url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${range}.geojson` },
        { id: 'EMSC', url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=150' },
        { id: 'GFZ', url: 'https://geofon.gfz.de/fdsnws/event/1/query?format=json&limit=50' }
    ];

    try {
        const responses = await Promise.allSettled(endpoints.map(e => fetch(e.url).then(res => res.json())));
        let unifiedFeatures = [];
        
        responses.forEach((res, index) => {
            if (res.status === 'fulfilled') {
                unifiedFeatures.push(...this.normalizeData(res.value, endpoints[index].id));
            }
        });

        this.state.rawEvents = this.deduplicateEvents(unifiedFeatures);
        this.updateUI();
        if (statusEl) statusEl.innerText = "Sinyal: Güçlü (Sismik Veri Aktif)";
    } catch (err) { 
        if (statusEl) statusEl.innerText = "Bağlantı Kesildi"; 
    }
};




SeismoEngine.updateUI = function() {
    const minMag = parseFloat(this.state.minMag);
    
    // 1. Filtreleme
    this.state.filteredEvents = this.state.rawEvents.filter(ev => {
        const mMatch = ev.mag >= minMag;
        const dMatch = this.state.depthFilter === 'all' || 
                      (this.state.depthFilter === 'shallow' ? ev.depth < 70 : ev.depth >= 70);
        return mMatch && dMatch;
    });

    // 2. Sıralama Mantığı (3 Aşamalı)
    if (this.state.sortMode === 'mag-desc') {
        this.state.filteredEvents.sort((a, b) => b.mag - a.mag);
    } else if (this.state.sortMode === 'mag-asc') {
        this.state.filteredEvents.sort((a, b) => a.mag - b.mag);
    } else {
        this.state.filteredEvents.sort((a, b) => b.time - a.time);
    }

    this.renderList();
    this.updateMapSource();
    this.processAnalytics();
    this.renderDepthAnalysis(); // Eksik olan derinlik analizini doldurur
};

SeismoEngine.renderDepthAnalysis = function() {
    const container = document.getElementById('depth-analysis');
    if (!container) return;

    const shallow = this.state.filteredEvents.filter(e => e.depth < 70).length;
    const intermediate = this.state.filteredEvents.filter(e => e.depth >= 70 && e.depth < 300).length;
    const deep = this.state.filteredEvents.filter(e => e.depth >= 300).length;

    container.innerHTML = `
        <div style="font-size: 11px; margin-top:10px;">
            <div style="display:flex; justify-content:space-between"><span>Sığ (0-70km):</span> <strong>${shallow}</strong></div>
            <div style="display:flex; justify-content:space-between"><span>Orta (70-300km):</span> <strong>${intermediate}</strong></div>
            <div style="display:flex; justify-content:space-between"><span>Derin (300km+):</span> <strong>${deep}</strong></div>
            <div class="depth-bar-visual" style="background: linear-gradient(to right, #ff4d4d ${ (shallow/this.state.filteredEvents.length)*100 }%, #f1c40f 0%, #3498db 0%);"></div>
        </div>
    `;
};


SeismoEngine.attachUIListeners = function() {
    // 3 Aşamalı Sıralama Butonu
    const sortBtn = document.getElementById('sort-btn');
    sortBtn?.addEventListener('click', () => {
        const modes = ['time', 'mag-desc', 'mag-asc'];
        const labels = ['En Güncel', 'Büyükten Küçüğe', 'Küçükten Büyüğe'];
        let currentIndex = modes.indexOf(this.state.sortMode);
        currentIndex = (currentIndex + 1) % modes.length;
        
        this.state.sortMode = modes[currentIndex];
        sortBtn.querySelector('.btn-text').innerText = labels[currentIndex];
        this.updateUI();
    });

    // Minimum Büyüklük Slider (Çalışmayan kısım düzeltildi)
    const magSlider = document.getElementById('mag-slider');
    magSlider?.addEventListener('input', (e) => {
        this.state.minMag = e.target.value;
        document.getElementById('mag-value').innerText = e.target.value + '+';
        this.updateUI();
    });

    // Rotasyon Toggle
    const rotBtn = document.getElementById('rotation-toggle');
    rotBtn?.addEventListener('click', () => {
        this.state.isRotating = !this.state.isRotating;
        rotBtn.classList.toggle('active');
        rotBtn.innerText = this.state.isRotating ? "🔄 Rotasyon: AÇIK" : "🔄 Rotasyon: KAPALI";
    });

    // Diğer Zaman ve Derinlik Filtreleri
    document.querySelectorAll('[data-time]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-time]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.state.timeRange = e.target.dataset.time;
            this.fetchSeismicData();
        });
    });
};


SeismoEngine.attachEventHandlers = function() {
    const map = this.state.map;

    map.on('click', 'unclustered-point', (e) => {
        const props = e.features[0].properties;
        const coordinates = e.features[0].geometry.coordinates.slice();
        
        // Teknik detayları içeren profesyonel pop-up
        const html = `
            <div class="popup-card">
                <div style="background: ${this.getMagColor(props.mag)}; color: #000; padding: 8px; border-radius: 6px; text-align:center; margin-bottom:10px;">
                    <strong style="font-size:1.2em;">M<sub>w</sub> ${parseFloat(props.mag).toFixed(1)}</strong>
                </div>
                <div style="font-size:12px; line-height:1.6;">
                    <strong>📍 Bölge:</strong> ${props.place}<br>
                    <strong>📉 Derinlik:</strong> ${props.depth.toFixed(1)} km<br>
                    <strong>🕒 Zaman:</strong> ${new Date(props.time).toLocaleString('tr-TR')}<br>
                    <strong>📡 Kaynak:</strong> <span class="badge" style="background:rgba(0,210,255,0.2); padding:2px 5px; border-radius:4px;">${props.source}</span><br>
                    <hr style="border:0; border-top:1px solid #444; margin:8px 0;">
                    <a href="${props.url}" target="_blank" style="color:var(--accent-blue); text-decoration:none; font-weight:bold; display:block; text-align:center;">
                        İstasyon Kayıtlarını İncele ↗
                    </a>
                </div>
            </div>
        `;

        new mapboxgl.Popup({ offset: 15, closeButton: false })
            .setLngLat(coordinates)
            .setHTML(html)
            .addTo(map);

        map.flyTo({ center: coordinates, zoom: 6, speed: 0.8 });
    });
};

// Sayfa yüklendiğinde motoru başlat
document.addEventListener('DOMContentLoaded', () => SeismoEngine.init());
