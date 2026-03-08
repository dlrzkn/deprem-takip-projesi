/**
 * SEISMO-PRO CORE & DATA ENGINE (V2.0)
 * Gelişmiş Jeofizik Analiz Platformu
 */
const SeismoEngine = {
    config: {
        token: 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q',
        mapStyle: {
            dark: 'mapbox://styles/mapbox/dark-v11',
            light: 'mapbox://styles/mapbox/light-v11'
        },
        refreshInterval: 120000, // 2 Dakika
        plateBoundariesUrl: 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json'
    },
    state: {
        map: null,
        rawEvents: [],
        filteredEvents: [],
        minMag: 0,
        depthFilter: 'all',
        timeRange: 'day', // Default: 24 Saat
        isRotating: true, // TV Modu
        currentTheme: 'dark',
        userInteracting: false
    },

    init() {
        mapboxgl.accessToken = this.config.token;
        this.state.map = new mapboxgl.Map({
            container: 'map',
            style: this.config.mapStyle.dark,
            center: [35, 39],
            zoom: 2.2,
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
            this.attachUIListeners();
            this.startRotationLoop(); // TV Modu Başlat
        });

        // Kullanıcı haritaya dokunduğunda rotasyonu durdurmak için
        this.state.map.on('movestart', () => { this.state.userInteracting = true; });
    },

    setupAtmosphere() {
        const isDark = this.state.currentTheme === 'dark';
        this.state.map.setFog({
            'range': [0.5, 10],
            'color': isDark ? '#0a0c10' : '#f0f2f5',
            'high-color': isDark ? '#161c24' : '#ffffff',
            'space-color': isDark ? '#000000' : '#ffffff',
            'horizon-blend': 0.02
        });
    },

    // TV Modu: Dünyayı kendi ekseninde yavaşça döndüren fonksiyon
    startRotationLoop() {
        const rotate = () => {
            if (this.state.isRotating && !this.state.userInteracting) {
                const center = this.state.map.getCenter();
                center.lng -= 0.15; // Dönüş hızı (Ayarlanabilir)
                this.state.map.easeTo({ center, duration: 200, easing: n => n });
            }
            requestAnimationFrame(rotate);
        };
        rotate();
    },

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
                    'line-width': 1.2, 
                    'line-opacity': 0.4, 
                    'line-dasharray': [2, 1] 
                }
            });
        } catch (e) { console.warn("Levha sınırları hatası:", e); }
    },

    initSources() {
        this.state.map.addSource('seismic-events', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterMaxZoom: 10,
            clusterRadius: 50
        });
    },

    startDataCycle() {
        this.fetchSeismicData();
        setInterval(() => this.fetchSeismicData(), this.config.refreshInterval);
    }
};


    /**
     * DINAMIK VERI MOTORU (V2.0)
     * Zaman aralığına göre USGS ve EMSC verilerini çeker
     */
    async fetchSeismicData() {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) statusEl.innerText = "Veri Alınıyor...";
        
        // Zaman filtresine göre USGS endpoint'ini belirle
        const range = this.state.timeRange; // hour, day, week
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
                    const sourceId = endpoints[index].id;
                    const data = res.value.features || (Array.isArray(res.value) ? res.value : []);
                    unifiedFeatures.push(...this.normalizeData(data, sourceId));
                }
            });

            // Akıllı Tekilleştirme ve Geçersiz Konum Filtreleme
            this.state.rawEvents = this.deduplicateEvents(unifiedFeatures)
                .filter(ev => !isNaN(ev.coordinates[0]) && !isNaN(ev.coordinates[1]));

            this.processAnalytics();
            this.updateUI();
            
            if (statusEl) statusEl.innerText = "Sinyal: Güçlü";
        } catch (err) {
            console.error("Veri Motoru Hatası:", err);
            if (statusEl) statusEl.innerText = "Bağlantı Kesildi";
        }
    },

    /**
     * JEOFİZİKSEL NORMALİZASYON
     * Kaynaklar arası veri farklarını (Derinlik, Bölge İsmi) eşitler
     */
    normalizeData(data, source) {
        return data.map(item => {
            const props = item.properties || item;
            const coords = item.geometry ? item.geometry.coordinates : [item.longitude, item.latitude];
            
            // EMSC 'region' veya USGS 'place' kullanımı
            let placeName = props.place || props.region || props.flynn_region || "Bilinmeyen Bölge";
            
            // Verideki derinlik null veya 0 ise sismolojik olarak "Sığ" kabul edilebilir
            // Ancak teknik analiz için sayısal değeri koruyoruz
            let depthVal = parseFloat(props.depth || props.depth_mag || 0);

            return {
                id: props.unid || props.ids || props.id,
                mag: parseFloat(props.mag || props.magnitude || 0),
                depth: depthVal,
                place: placeName,
                time: new Date(props.time || props.m_time).getTime(),
                source: source,
                coordinates: [parseFloat(coords[0]), parseFloat(coords[1])],
                url: props.url || (source === 'EMSC' ? `https://www.emsc-csem.org/event/${props.unid}` : "#")
            };
        });
    },

    deduplicateEvents(events) {
        const cleanList = [];
        events.forEach(event => {
            const isDuplicate = cleanList.some(ex => 
                Math.abs(ex.time - event.time) < 120000 && // 2 dakika tolerans
                Math.abs(ex.coordinates[0] - event.coordinates[0]) < 0.8 // Yakın koordinat
            );
            if (!isDuplicate) cleanList.push(event);
        });
        return cleanList;
    }
}; // SeismoEngine ana objesinin sonu (Şimdilik)



/**
 * SEISMO-PRO VISUAL & INTERFACE ENGINE (V2.0)
 */

// 10. Dinamik Harita Katmanları
SeismoEngine.initLayers = function() {
    const map = this.state.map;

    // Kümelenmiş (Cluster) Görünüm
    map.addLayer({
        id: 'clusters', type: 'circle', source: 'seismic-events', filter: ['has', 'point_count'],
        paint: {
            'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 10, '#f1f075', 30, '#f28cb1'],
            'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 30, 40],
            'circle-opacity': 0.6, 'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(255,255,255,0.1)'
        }
    });

    map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'seismic-events', filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count}', 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff' }
    });

    // Tekil Depremler: Derinliğe Göre Renk (Sığ=Kırmızı, Derin=Mavi)
    map.addLayer({
        id: 'unclustered-point', type: 'circle', source: 'seismic-events', filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-color': ['interpolate', ['linear'], ['get', 'depth'], 0, '#ff4d4d', 70, '#f1c40f', 300, '#3498db', 700, '#9b59b6'],
            'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 4, 5, 12, 7, 25, 9, 45],
            'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff', 'circle-opacity': 0.85
        }
    });
};

// 11. Gelişmiş Arayüz Senkronizasyonu
SeismoEngine.updateUI = function() {
    const minMag = parseFloat(this.state.minMag);
    this.state.filteredEvents = this.state.rawEvents.filter(ev => {
        const mMatch = ev.mag >= minMag;
        const dMatch = this.state.depthFilter === 'all' || 
                      (this.state.depthFilter === 'shallow' ? ev.depth < 70 : ev.depth >= 70);
        return mMatch && dMatch;
    });

    this.renderList();
    this.updateMapSource();
};

// 12. Canlı Liste ve Fly-To Etkileşimi
SeismoEngine.renderList = function() {
    const container = document.getElementById('earthquake-feed');
    const countLabel = document.getElementById('event-count');
    if (!container) return;
    
    container.innerHTML = '';
    countLabel.innerText = `${this.state.filteredEvents.length} Olay Listeleniyor`;

    [...this.state.filteredEvents].sort((a,b) => b.time - a.time).forEach(ev => {
        const node = document.createElement('div');
        node.className = 'earthquake-node';
        const color = this.getMagColor(ev.mag);
        
        // Derinlik 0 ise 'Sığ' yazdır, değilse değeri göster
        const depthLabel = ev.depth > 0 ? `${ev.depth} km` : 'Sığ Odak';

        node.innerHTML = `
            <div class="mag-circle" style="border-color: ${color}; color: ${color}">${ev.mag.toFixed(1)}</div>
            <div class="node-details">
                <div class="node-title" style="font-weight: 600; font-size: 13px;">${ev.place}</div>
                <div class="node-meta" style="font-size: 11px; color: #888;">
                    <span>${depthLabel}</span> • <span>${new Date(ev.time).toLocaleTimeString('tr-TR')}</span>
                </div>
            </div>`;
        
        node.onclick = () => {
            this.state.userInteracting = true;
            this.state.map.flyTo({ center: ev.coordinates, zoom: 8, speed: 1.2 });
        };
        container.appendChild(node);
    });
};

// 13. Olay Dinleyicileri (Filtreler, Tema, Rotasyon)
SeismoEngine.attachUIListeners = function() {
    // Zaman Filtreleri (1s, 24s, 7g)
    document.querySelectorAll('[data-time]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-time]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.state.timeRange = e.target.dataset.time;
            
            // Üst bardaki enerji etiketini güncelle
            const labels = { hour: 'SON 1S', day: 'SON 24S', week: 'SON 7G' };
            document.getElementById('energy-label').innerText = `${labels[this.state.timeRange]} ENERJİ SALINIMI:`;
            
            this.fetchSeismicData();
        });
    });

    // Tema Değiştirici (Gece/Gündüz)
    document.getElementById('theme-toggle')?.addEventListener('click', (e) => {
        const body = document.body;
        this.state.currentTheme = body.classList.contains('light-mode') ? 'dark' : 'light';
        body.classList.toggle('light-mode');
        
        e.target.innerText = this.state.currentTheme === 'light' ? '🌙 Gece Modu' : '🌓 Gündüz Modu';
        this.state.map.setStyle(this.config.mapStyle[this.state.currentTheme]);
        
        this.state.map.once('style.load', () => {
            this.setupAtmosphere();
            this.initSources();
            this.initLayers();
            this.updateMapSource();
        });
    });

    // Rotasyon (TV Modu) Toggle
    document.getElementById('rotation-toggle')?.addEventListener('click', (e) => {
        this.state.isRotating = !this.state.isRotating;
        this.state.userInteracting = false;
        e.target.classList.toggle('active', this.state.isRotating);
        e.target.innerText = this.state.isRotating ? '🌎 Rotasyon: AÇIK' : '🔄 Rotasyon: KAPALI';
    });

    // Büyüklük ve Derinlik Filtreleri (Mevcut yapı)
    document.getElementById('mag-range')?.addEventListener('input', (e) => {
        this.state.minMag = e.target.value;
        document.getElementById('mag-value').innerText = `${e.target.value}+`;
        this.updateUI();
    });

    document.querySelectorAll('[data-depth]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-depth]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.state.depthFilter = e.target.dataset.depth;
            this.updateUI();
        });
    });

    // Saat
    setInterval(() => {
        const clock = document.getElementById('clock');
        if (clock) clock.innerText = new Date().toLocaleTimeString('tr-TR');
    }, 1000);
};

// 14. Harita Veri Güncelleme ve Popup
SeismoEngine.updateMapSource = function() {
    const geojson = { type: 'FeatureCollection', features: this.state.filteredEvents.map(ev => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: ev.coordinates }, properties: ev
    }))};
    if (this.state.map.getSource('seismic-events')) {
        this.state.map.getSource('seismic-events').setData(geojson);
    }
};

SeismoEngine.attachEventHandlers = function() {
    const map = this.state.map;
    map.on('click', 'unclustered-point', (e) => {
        this.state.userInteracting = true;
        const props = e.features[0].properties;
        const energy = this.calculateEnergy(props.mag).toExponential(2);
        
        new mapboxgl.Popup({ offset: 15, closeButton: false })
            .setLngLat(e.features[0].geometry.coordinates)
            .setHTML(`
                <div class="popup-card">
                    <div class="popup-header" style="background: ${this.getMagColor(props.mag)}; padding: 8px; color: #fff; border-radius: 4px 4px 0 0;">
                        <strong>M<sub>w</sub> ${parseFloat(props.mag).toFixed(1)}</strong>
                        <span style="float:right; font-size:10px; opacity:0.8;">${props.source}</span>
                    </div>
                    <div class="popup-body" style="padding: 12px; color: #333; background: #fff; border-radius: 0 0 4px 4px;">
                        <p style="margin: 0 0 5px 0;"><strong>Bölge:</strong> ${props.place}</p>
                        <p style="margin: 0 0 5px 0;"><strong>Derinlik:</strong> ${props.depth > 0 ? props.depth + ' km' : 'Sığ Odak'}</p>
                        <p style="margin: 0;"><strong>Enerji:</strong> ${energy} J</p>
                    </div>
                </div>
            `).addTo(map);
    });

    map.on('mouseenter', 'unclustered-point', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'unclustered-point', () => map.getCanvas().style.cursor = '');
    
    // Haritaya tıklayınca rotasyonu tekrar aktif etmek için (isteğe bağlı)
    map.on('dragend', () => { setTimeout(() => { this.state.userInteracting = false; }, 3000); });
};

SeismoEngine.getMagColor = function(mag) {
    if (mag >= 7) return '#c0392b';
    if (mag >= 5) return '#e67e22';
    if (mag >= 3) return '#f1c40f';
    return '#2ecc71';
};

// Uygulamayı Başlat
document.addEventListener('DOMContentLoaded', () => {
    if (typeof SeismoEngine !== 'undefined') SeismoEngine.init();
});
