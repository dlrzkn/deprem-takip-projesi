/**
 * SEISMO-PRO CORE ENGINE
 * Modüler yapı: Veri Çekme, Analiz ve Görselleştirme
 */

const SeismoEngine = {
    // Yapılandırma
    config: {
        token: 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q',
        mapStyle: 'mapbox://styles/mapbox/dark-v11',
        refreshInterval: 120000, // 2 dakika
        plateBoundariesUrl: 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json'
    },

    state: {
        map: null,
        rawEvents: [],
        filteredEvents: [],
        minMag: 0,
        depthFilter: 'all',
        isRotationActive: true
    },

    // 1. Uygulamayı Başlat
    init() {
        mapboxgl.accessToken = this.config.token;
        this.state.map = new mapboxgl.Map({
            container: 'map',
            style: this.config.mapStyle,
            center: [35, 39], // Türkiye merkezli başlangıç
            zoom: 2.5,
            projection: 'globe',
            antialias: true
        });

        this.state.map.on('load', () => {
            this.setupAtmosphere();
            this.loadPlateBoundaries();
            this.initSources();
            this.initLayers();
            this.attachEventHandlers();
            this.startDataCycle();
        });
    },

    // 2. Jeofiziksel Görsellik: Atmosfer ve Sis Efektleri
    setupAtmosphere() {
        this.state.map.setFog({
            'range': [0.5, 10],
            'color': '#0a0c10',
            'high-color': '#161c24',
            'space-color': '#000000',
            'horizon-blend': 0.02
        });
    },

    // 3. Levha Sınırlarını Yükle (Jeofiziksel Referans)
    async loadPlateBoundaries() {
        try {
            const response = await fetch(this.config.plateBoundariesUrl);
            const data = await response.json();
            
            this.state.map.addSource('plates', { type: 'geojson', data: data });
            this.state.map.addLayer({
                id: 'plates-layer',
                type: 'line',
                source: 'plates',
                paint: {
                    'line-color': '#ff4d4d',
                    'line-width': 1.5,
                    'line-opacity': 0.3,
                    'line-dasharray': [2, 2]
                }
            });
        } catch (e) {
            console.warn("Levha sınırları yüklenemedi:", e);
        }
    },

    // 4. Veri Kaynaklarını Hazırla
    initSources() {
        this.state.map.addSource('seismic-events', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterMaxZoom: 10,
            clusterRadius: 50
        });
    }
};

// Uygulamayı çalıştır
document.addEventListener('DOMContentLoaded', () => SeismoEngine.init());


/**
 * SEISMO-PRO DATA ENGINE
 * Veri çekme, Tekilleştirme ve Sismik Enerji Hesaplama
 */

// SeismoEngine nesnesine eklenecek metodlar:

// 5. Veri Döngüsünü Başlat
SeismoEngine.startDataCycle = function() {
    this.fetchSeismicData();
    setInterval(() => this.fetchSeismicData(), this.config.refreshInterval);
};

// 6. Global Servislerden Veri Çekme
SeismoEngine.fetchSeismicData = async function() {
    document.getElementById('connection-status').innerText = "Veri Alınıyor...";
    
    const endpoints = [
        { id: 'USGS', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson' },
        { id: 'EMSC', url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=100' },
        { id: 'GFZ', url: 'https://geofon.gfz.de/fdsnws/event/1/query?format=json&limit=50' }
    ];

    try {
        const responses = await Promise.allSettled(endpoints.map(e => fetch(e.url).then(res => res.json())));
        let unifiedFeatures = [];

        responses.forEach((res, index) => {
            if (res.status === 'fulfilled') {
                const sourceId = endpoints[index].id;
                const data = res.value.features || res.value; // Servis yapısına göre normalizasyon
                unifiedFeatures.push(...this.normalizeData(data, sourceId));
            }
        });

        this.state.rawEvents = this.deduplicateEvents(unifiedFeatures);
        this.processAnalytics(); // Jeofiziksel analizleri tetikle
        this.updateUI();        // Arayüzü güncelle
    } catch (err) {
        console.error("Sismik veri motoru hatası:", err);
        document.getElementById('connection-status').innerText = "Bağlantı Hatası";
    }
};

// 7. Veri Normalizasyonu (Her servisi ortak dile çevirme)
SeismoEngine.normalizeData = function(data, source) {
    return data.map(item => {
        const props = item.properties || item;
        const coords = item.geometry ? item.geometry.coordinates : [item.longitude, item.latitude];
        
        return {
            id: props.unid || props.ids || props.id,
            mag: parseFloat(props.mag || props.magnitude || 0),
            depth: parseFloat(props.depth || props.depth_mag || 0),
            place: props.place || props.region || "Bilinmeyen Bölge",
            time: new Date(props.time || props.m_time).getTime(),
            source: source,
            coordinates: [parseFloat(coords[0]), parseFloat(coords[1])],
            url: props.url || "#"
        };
    });
};

// 8. Akıllı Tekilleştirme (Aynı depremi farklı kaynaklar bildirebilir)
SeismoEngine.deduplicateEvents = function(events) {
    const cleanList = [];
    const timeThreshold = 60000; // 1 dakika içindeki yakın konumlu depremler aynı sayılır
    const distThreshold = 0.5;   // Koordinat farkı eşiği

    events.forEach(event => {
        const isDuplicate = cleanList.some(existing => {
            const timeDiff = Math.abs(existing.time - event.time) < timeThreshold;
            const distDiff = Math.abs(existing.coordinates[0] - event.coordinates[0]) < distThreshold;
            return timeDiff && distDiff;
        });
        if (!isDuplicate) cleanList.push(event);
    });
    return cleanList;
};

// 9. Jeofiziksel Analiz: Sismik Enerji Hesaplama (Gutenberg-Richter Logaritmik)
SeismoEngine.calculateEnergy = function(mag) {
    /**
     * Moment Magnitüd ölçeğinde enerji salınımı formülü:
     * log10(E) = 4.8 + 1.5 * Mw
     * Sonuç: Joule
     */
    if (mag <= 0) return 0;
    const energyLog = 4.8 + (1.5 * mag);
    return Math.pow(10, energyLog);
};

SeismoEngine.processAnalytics = function() {
    let totalJoule = 0;
    this.state.rawEvents.forEach(ev => {
        totalJoule += this.calculateEnergy(ev.mag);
    });

    // Joule'ü daha okunabilir bir birime çevir (Terajoule veya Petajoule)
    const formattedEnergy = (totalJoule / 1e12).toFixed(2); // TeraJoule (TJ)
    document.getElementById('total-energy').innerText = `${formattedEnergy} TJ`;
};



/**
 * SEISMO-PRO VISUAL ENGINE
 * Harita Katmanları, Renk Skalaları ve Popup Yönetimi
 */

// 10. Harita Katmanlarını ve Stil Dinamiklerini Oluştur
SeismoEngine.initLayers = function() {
    const map = this.state.map;

    // Kümelenmiş (Cluster) Katmanı: Çoklu depremleri gruplar
    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'seismic-events',
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 10, '#f1f075', 30, '#f28cb1'],
            'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 30, 40],
            'circle-opacity': 0.6,
            'circle-stroke-width': 2,
            'circle-stroke-color': 'rgba(255,255,255,0.1)'
        }
    });

    map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'seismic-events',
        filter: ['has', 'point_count'],
        layout: {
            'text-field': '{point_count}',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12
        },
        paint: { 'text-color': '#ffffff' }
    });

    // Tekil Deprem Noktaları (Unclustered)
    map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'seismic-events',
        filter: ['!', ['has', 'point_count']],
        paint: {
            // JEOFİZİKSEL RENKLENDİRME: Derinliğe göre renk (Sığ=Kırmızı, Derin=Mavi)
            'circle-color': [
                'interpolate', ['linear'], ['get', 'depth'],
                0, '#ff4d4d',    // 0-70km Sığ (Tehlikeli)
                70, '#f1c40f',   // 70-300km Orta
                300, '#3498db',  // 300-700km Derin
                700, '#9b59b6'
            ],
            // BÜYÜKLÜĞE GÖRE RADYUS (Logaritmik Etki)
            'circle-radius': [
                'interpolate', ['linear'], ['get', 'mag'],
                1, 4,
                5, 12,
                7, 25,
                9, 45
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.8
        }
    });
};

// 11. Popup ve Bilgi Kartı Yönetimi
SeismoEngine.attachEventHandlers = function() {
    const map = this.state.map;

    map.on('click', 'unclustered-point', (e) => {
        const props = e.features[0].properties;
        const coordinates = e.features[0].geometry.coordinates.slice();
        
        // Enerji ve Uzaklık Analizi (Örnek: 100km çapındaki etki)
        const energy = this.calculateEnergy(props.mag).toExponential(2);

        const html = `
            <div class="popup-card">
                <div class="popup-header" style="background: ${this.getMagColor(props.mag)}">
                    <strong>M<sub>w</sub> ${props.mag.toFixed(1)}</strong>
                    <span>${props.source}</span>
                </div>
                <div class="popup-body">
                    <p><strong>Bölge:</strong> ${props.place}</p>
                    <p><strong>Derinlik:</strong> ${props.depth} km</p>
                    <p><strong>Enerji:</strong> ${energy} J</p>
                    <p class="popup-time">${new Date(props.time).toLocaleString('tr-TR')}</p>
                </div>
                <div class="popup-footer">
                    <a href="${props.url}" target="_blank">AFAD/EMSC Detay ↗</a>
                </div>
            </div>
        `;

        new mapboxgl.Popup({ offset: 15 })
            .setLngLat(coordinates)
            .setHTML(html)
            .addTo(map);
    });

    // Mouse imleci değişimi
    map.on('mouseenter', 'unclustered-point', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'unclustered-point', () => map.getCanvas().style.cursor


           /**
 * SEISMO-PRO INTERFACE ENGINE
 * Dinamik Liste, Filtreleme ve UI Güncellemeleri
 */

// 12. Arayüzü Veriyle Güncelle
SeismoEngine.updateUI = function() {
    this.filterData();
    this.renderList();
    this.updateStats();
    this.updateMapSource();
};

// 13. Veri Filtreleme (Büyüklük ve Derinlik)
SeismoEngine.filterData = function() {
    const minMag = parseFloat(this.state.minMag);
    const depthFilter = this.state.depthFilter;

    this.state.filteredEvents = this.state.rawEvents.filter(ev => {
        const magMatch = ev.mag >= minMag;
        let depthMatch = true;

        if (depthFilter === 'shallow') depthMatch = ev.depth < 70;
        else if (depthFilter === 'deep') depthMatch = ev.depth >= 70;

        return magMatch && depthMatch;
    });
};

// 14. Sağ Panel: Canlı Sismik Akış Listesi
SeismoEngine.renderList = function() {
    const container = document.getElementById('earthquake-feed');
    const countLabel = document.getElementById('event-count');
    if (!container) return;

    container.innerHTML = '';
    countLabel.innerText = `${this.state.filteredEvents.length} Olay Listeleniyor`;

    // En güncel deprem en üstte
    const sorted = [...this.state.filteredEvents].sort((a, b) => b.time - a.time);

    sorted.forEach(ev => {
        const node = document.createElement('div');
        node.className = 'earthquake-node';
        
        // Dinamik Renk ve Stil
        const color = this.getMagColor(ev.mag);
        
        node.innerHTML = `
            <div class="mag-circle" style="border-color: ${color}; color: ${color}">
                ${ev.mag.toFixed(1)}
            </div>
            <div class="node-details">
                <div class="node-title">${ev.place}</div>
                <div class="node-meta">
                    <span>${ev.depth} km</span> • 
                    <span>${new Date(ev.time).toLocaleTimeString('tr-TR')}</span> • 
                    <span class="src-tag">${ev.source}</span>
                </div>
            </div>
        `;

        node.onclick = () => {
            this.state.map.flyTo({
                center: ev.coordinates,
                zoom: 8,
                essential: true
            });
        };
        
        container.appendChild(node);
    });
};

// 15. Filtre Kontrollerini Bağla
SeismoEngine.attachUIListeners = function() {
    // Büyüklük Slider'ı
    const magRange = document.getElementById('mag-range');
    const magVal = document.getElementById('mag-value');
    
    magRange.addEventListener('input', (e) => {
        this.state.minMag = e.target.value;
        magVal.innerText = `${e.target.value}+`;
        this.updateUI();
    });

    // Derinlik Butonları
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.state.depthFilter = e.target.dataset.depth;
            this.updateUI();
        });
    });

    // Levha Sınırları Toggle
    document.getElementById('plate-boundaries').addEventListener('change', (e) => {
        const visibility = e.target.checked ? 'visible' : 'none';
        if (this.state.map.getLayer('plates-layer')) {
            this.state.map.setLayoutProperty('plates-layer', 'visibility', visibility);
        }
    });
};

// 16. Harita Kaynağını Güncelle (Source Update)
SeismoEngine.updateMapSource = function() {
    const geojson = {
        type: 'FeatureCollection',
        features: this.state.filteredEvents.map(ev => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: ev.coordinates },
            properties: ev
        }))
    };
    
    if (this.state.map.getSource('seismic-events')) {
        this.state.map.getSource('seismic-events').setData(geojson);
    }
};

// Engine Başlatıldığında UI Listener'ları da çalıştır
const originalInit = SeismoEngine.init;
SeismoEngine.init = function() {
    originalInit.call(this);
    this.attachUIListeners();
    
    // Saat Güncelleme (Gerçek zamanlı takip hissi için)
    setInterval(() => {
        document.getElementById('clock').innerText = new Date().toLocaleTimeString('tr-TR');
    }, 1000);
};

