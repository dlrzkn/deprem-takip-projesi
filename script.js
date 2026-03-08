/**
 * SEISMO-PRO CORE & DATA ENGINE (V4.1)
 * Profesyonel Sismik Analiz ve Görselleştirme Terminali
 */

const SeismoEngine = {
    config: {
        token: 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q',
        mapStyle: {
            dark: 'mapbox://styles/mapbox/dark-v11',
            light: 'mapbox://styles/mapbox/satellite-streets-v12'
        },
        refreshInterval: 120000, // 2 Dakika
        plateBoundariesUrl: 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json'
    },

    state: {
        map: null,
        rawEvents: [],          // Ham veri
        filteredEvents: [],     // Filtrelenmiş veri
        minMag: 0,              // Slider değeri
        depthFilter: 'all',     // sığ/derin/tümü
        timeRange: 'day',       // 1s/24s/7g
        isRotating: true,       // Otomatik rotasyon durumu
        currentTheme: 'dark',
        userInteracting: false,
        rotationTimeout: null,
        // Sıralama durumu: 0: Zaman (Varsayılan), 1: Mag (Azalan), 2: Mag (Artan)
        sortMode: 0 
    },

    /**
     * Engine Başlatıcı
     */
    init() {
        mapboxgl.accessToken = this.config.token;
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

        // Kullanıcı etkileşimi algılama (Rotasyon kontrolü için)
        const stopRotation = () => {
            this.state.userInteracting = true;
            clearTimeout(this.state.rotationTimeout);
            this.state.rotationTimeout = setTimeout(() => {
                this.state.userInteracting = false;
            }, 5000);
        };

        const events = ['mousedown', 'touchstart', 'wheel', 'dragstart'];
        events.forEach(ev => this.state.map.on(ev, stopRotation));
    },

    /**
     * Sismolojik Veri Normalizasyonu
     * Farklı kaynaklardan (USGS, EMSC, GFZ) gelen verileri tek bir standart objeye dönüştürür.
     */
    normalizeData(data, source) {
        return data.map(item => {
            const props = item.properties || item;
            const coords = item.geometry ? item.geometry.coordinates : [item.longitude, item.latitude];
            
            // Profesyonel isimlendirme kontrolü
            let placeName = props.place || props.region || props.flynn_region || "Bilinmeyen Bölge";
            
            // Kaynak bazlı ID ve Link yönetimi
            let externalUrl = "#";
            if (source === 'USGS') externalUrl = `https://earthquake.usgs.gov/earthquakes/eventpage/${props.code || props.id}`;
            else if (source === 'EMSC') externalUrl = `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${props.unid}`;

            return {
                id: props.unid || props.id || Math.random().toString(36),
                mag: parseFloat(props.mag || props.magnitude || 0),
                depth: parseFloat(props.depth || props.depth_mag || 0),
                place: placeName,
                time: new Date(props.time || props.m_time).getTime(),
                source: source,
                url: externalUrl,
                coordinates: [parseFloat(coords[0]), parseFloat(coords[1])]
            };
        });
    }
};


/**
 * DATA CYCLE & SEISMIC ANALYTICS
 */

// Veri döngüsünü başlatan ana metod
SeismoEngine.startDataCycle = function() {
    this.fetchSeismicData();
    // Konfigürasyondaki aralıkla (2 dk) veriyi tazele
    setInterval(() => this.fetchSeismicData(), this.config.refreshInterval);
};

// Üç farklı kaynaktan eş zamanlı veri çekme
SeismoEngine.fetchSeismicData = async function() {
    const statusEl = document.getElementById('connection-status');
    const range = this.state.timeRange;
    
    // Sismolojik Veri Kaynakları (API Endpoints)
    const endpoints = [
        { id: 'USGS', url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${range}.geojson` },
        { id: 'EMSC', url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=250' },
        { id: 'GFZ', url: 'https://geofon.gfz.de/fdsnws/event/1/query?format=json&limit=100' }
    ];

    try {
        const responses = await Promise.allSettled(
            endpoints.map(e => fetch(e.url).then(res => res.json()))
        );

        let unifiedFeatures = [];

        responses.forEach((res, index) => {
            if (res.status === 'fulfilled') {
                const data = res.value.features || (Array.isArray(res.value) ? res.value : []);
                // Bölüm 1'deki normalizasyon metodunu kullanarak veriyi standartlaştır
                unifiedFeatures.push(...this.normalizeData(data, endpoints[index].id));
            }
        });

        // Profesyonel Tekilleştirme (Cross-Source Deduplication)
        this.state.rawEvents = this.deduplicateEvents(unifiedFeatures);
        
        // Analiz ve Görselleştirme Tetikleyicileri
        this.processAnalytics();
        this.updateUI(); // Filtreleri uygula ve listeyi bas

        if (statusEl) statusEl.innerText = "Sinyal: Güçlü";
    } catch (err) { 
        console.error("Veri çekme hatası:", err);
        if (statusEl) statusEl.innerText = "Bağlantı Kesildi"; 
    }
};

/**
 * Jeofiziksel Tekilleştirme Algoritması
 * Farklı kurumlardan gelen aynı depremi; zaman (±2 dk) ve mesafe (±0.8 derece) 
 * toleransıyla eşleştirip tek bir kayıt olarak saklar.
 */
SeismoEngine.deduplicateEvents = function(events) {
    const cleanList = [];
    // En yüksek büyüklüğe sahip olanı tercih etmek için önce büyüklüğe göre sıralayabiliriz
    events.sort((a, b) => b.mag - a.mag);

    events.forEach(event => {
        const isDuplicate = cleanList.some(ex => 
            Math.abs(ex.time - event.time) < 120000 && // 120.000 ms = 2 Dakika
            Math.abs(ex.coordinates[0] - event.coordinates[0]) < 0.8 &&
            Math.abs(ex.coordinates[1] - event.coordinates[1]) < 0.8
        );
        if (!isDuplicate) cleanList.push(event);
    });
    return cleanList;
};

/**
 * Sismik Enerji Salınımı Analizi (Gutenberg-Richter Temelli)
 * Logaritmik büyüklüğü Joule cinsinden kinetik enerjiye çevirir.
 */
SeismoEngine.processAnalytics = function() {
    let totalJoule = 0;
    this.state.rawEvents.forEach(ev => {
        if (ev.mag > 0) {
            // Gutenberg-Richter Enerji Formülü: log10(E) = 4.8 + 1.5 * Mw
            totalJoule += Math.pow(10, 4.8 + (1.5 * ev.mag));
        }
    });
    
    const energyEl = document.getElementById('total-energy');
    const labelEl = document.getElementById('energy-label');
    
    // Dinamik Etiket Güncellemesi (UI)
    const timeLabels = { hour: 'SON 1 SAAT', day: 'SON 24 SAAT', week: 'SON 7 GÜN' };
    if (labelEl) labelEl.innerText = `${timeLabels[this.state.timeRange]} ENERJİ SALINIMI:`;
    
    // Terajul (TJ) dönüşümü (1 TJ = 10^12 Joule)
    if (energyEl) energyEl.innerText = `${(totalJoule / 1e12).toFixed(2)} TJ`;
};


/**
 * UI LISTENERS & INTERACTIVE CONTROLS
 */

SeismoEngine.attachUIListeners = function() {
    // 1. Üç Aşamalı Sıralama Filtresi (En Önemli Kısım)
    const sortBtn = document.getElementById('sort-btn');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            // Mod Döngüsü: 0 (Zaman-Yeni) -> 1 (Mag-Büyük) -> 2 (Mag-Küçük) -> 0...
            this.state.sortMode = (this.state.sortMode + 1) % 3;
            
            // Buton metnini görsel olarak güncelle (Kullanıcı geri bildirimi için)
            const labels = ["🕒 En Güncel", "📉 Büyükten Küçüğe", "📈 Küçükten Büyüğe"];
            sortBtn.innerText = labels[this.state.sortMode];
            
            this.updateUI(); // Listeyi yeniden sırala ve bas
        });
    }

    // 2. Minimum Büyüklük Slider (Çalışmayan Slider Çözümü)
    const magSlider = document.getElementById('mag-slider');
    const magValDisplay = document.getElementById('mag-value');
    if (magSlider) {
        magSlider.addEventListener('input', (e) => {
            this.state.minMag = parseFloat(e.target.value);
            if (magValDisplay) magValDisplay.innerText = this.state.minMag.toFixed(1) + '+';
            this.updateUI(); // Harita ve listeyi anlık güncelle
        });
    }

    // 3. Rotasyon Butonu (Aç/Kapat Mantığı)
    const rotationBtn = document.getElementById('rotation-toggle');
    if (rotationBtn) {
        rotationBtn.addEventListener('click', () => {
            this.state.isRotating = !this.state.isRotating; // State'i tersine çevir
            
            // UI Güncelleme
            rotationBtn.classList.toggle('active');
            rotationBtn.innerText = this.state.isRotating ? "🔄 Rotasyon: AÇIK" : "📍 Rotasyon: KAPALI";
            
            // Eğer kullanıcı manuel kapattıysa, interaction timeout'u temizle
            if (!this.state.isRotating) {
                this.state.userInteracting = false;
                clearTimeout(this.state.rotationTimeout);
            }
        });
    }

    // 4. Zaman Aralığı Filtreleri (1s / 24s / 7g)
    document.querySelectorAll('[data-time]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-time]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.state.timeRange = e.target.dataset.time;
            this.fetchSeismicData(); // Yeni zaman aralığı için API'ye git
        });
    });

    // 5. Odak Derinliği Filtreleri
    document.querySelectorAll('[data-depth]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-depth]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.state.depthFilter = e.target.dataset.depth;
            this.updateUI();
        });
    });

    // 6. Gündüz/Gece Modu (Tema Değişimi)
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        const isDark = this.state.currentTheme === 'dark';
        this.state.currentTheme = isDark ? 'light' : 'dark';
        
        // CSS Sınıfı ve Mapbox Stili Güncelleme
        document.body.classList.toggle('light-mode');
        this.state.map.setStyle(this.config.mapStyle[this.state.currentTheme]);
        
        // Atmosfer ayarlarını yeni temaya göre tekrar yap (Bölüm 1'deki metod)
        this.state.map.once('style.load', () => this.setupAtmosphere());
    });
};

/**
 * Global UI Güncelleyici
 * Filtreleme ve Sıralama işlemlerini tek merkezden yönetir.
 */
SeismoEngine.updateUI = function() {
    // Filtreleme: Büyüklük ve Derinlik
    this.state.filteredEvents = this.state.rawEvents.filter(ev => {
        const magMatch = ev.mag >= this.state.minMag;
        const depthMatch = this.state.depthFilter === 'all' || 
            (this.state.depthFilter === 'shallow' ? ev.depth < 70 : ev.depth >= 70);
        return magMatch && depthMatch;
    });

    // Sıralama (Sort Mode'a göre)
    const mode = this.state.sortMode;
    this.state.filteredEvents.sort((a, b) => {
        if (mode === 0) return b.time - a.time;      // En Yeni En Üstte
        if (mode === 1) return b.mag - a.mag;        // Büyükten Küçüğe
        if (mode === 2) return a.mag - b.mag;        // Küçükten Büyüye
        return 0;
    });

    this.renderList();      // Sağ paneli güncelle
    this.updateMapSource(); // Haritadaki noktaları güncelle
    this.renderDepthChart(); // Alt soldaki derinlik analizini güncelle
};


/**
 * GEOSPATIAL POP-UPS & DEPTH ANALYTICS
 */

// Harita üzerindeki noktalara tıklama ve etkileşim yönetimi
SeismoEngine.attachEventHandlers = function() {
    const map = this.state.map;

    map.on('click', 'unclustered-point', (e) => {
        const props = e.features[0].properties;
        this.state.userInteracting = true;

        // Koordinatları al ve haritayı oraya odakla
        const coordinates = e.features[0].geometry.coordinates.slice();
        
        // Profesyonel Pop-up İçeriği (Kaynağa göre dinamik link ve renk)
        const popupHTML = `
            <div class="popup-card">
                <div class="popup-header" style="background: ${this.getMagColor(props.mag)};">
                    <strong>M<sub>w</sub> ${parseFloat(props.mag).toFixed(1)}</strong>
                    <span class="source-tag">${props.source}</span>
                </div>
                <div class="popup-body">
                    <p><strong>Bölge:</strong> ${props.place}</p>
                    <p><strong>Derinlik:</strong> ${props.depth > 0 ? props.depth + ' km' : 'Sığ (0-5 km)'}</p>
                    <p><strong>Zaman:</strong> ${new Date(props.time).toLocaleString('tr-TR')}</p>
                    <hr>
                    <div class="popup-actions">
                        <a href="${props.url}" target="_blank" class="popup-link">
                            ${props.source === 'USGS' ? 'USGS Detay Sayfası' : 'Bilimsel Kaynağa Git'} ↗
                        </a>
                    </div>
                </div>
            </div>
        `;

        new mapboxgl.Popup({ offset: 15, closeButton: true })
            .setLngLat(coordinates)
            .setHTML(popupHTML)
            .addTo(map);
    });

    // Mouse imleci efektleri
    map.on('mouseenter', 'unclustered-point', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'unclustered-point', () => map.getCanvas().style.cursor = '');
};

/**
 * Derinlik Dağılımı Analiz Paneli (Histogram Mantığı)
 * Sol alt köşedeki "Derinlik Dağılımı" başlığının altını doldurur.
 */
SeismoEngine.renderDepthChart = function() {
    const container = document.getElementById('depth-analysis');
    if (!container) return;

    // Sismolojik katmanlara göre gruplandırma
    const stats = {
        shallow: this.state.filteredEvents.filter(ev => ev.depth < 70).length,   // Sığ Odaklı
        intermediate: this.state.filteredEvents.filter(ev => ev.depth >= 70 && ev.depth < 300).length, // Orta Odaklı
        deep: this.state.filteredEvents.filter(ev => ev.depth >= 300).length     // Derin Odaklı
    };

    const total = this.state.filteredEvents.length || 1;
    const getPercent = (val) => ((val / total) * 100).toFixed(1);

    container.innerHTML = `
        <div class="depth-stat-row">
            <span>Sığ (0-70km):</span>
            <div class="stat-bar"><div class="bar-fill sığ" style="width: ${getPercent(stats.shallow)}%"></div></div>
            <span class="stat-val">%${getPercent(stats.shallow)}</span>
        </div>
        <div class="depth-stat-row">
            <span>Orta (70-300km):</span>
            <div class="stat-bar"><div class="bar-fill orta" style="width: ${getPercent(stats.intermediate)}%"></div></div>
            <span class="stat-val">%${getPercent(stats.intermediate)}</span>
        </div>
        <div class="depth-stat-row">
            <span>Derin (>300km):</span>
            <div class="stat-bar"><div class="bar-fill derin" style="width: ${getPercent(stats.deep)}%"></div></div>
            <span class="stat-val">%${getPercent(stats.deep)}</span>
        </div>
    `;
};

// Harita kaynağını (GeoJSON) güncelleme
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

/**
 * Otomatik Küre Rotasyonu (Sürekli Döngü)
 */
SeismoEngine.startRotationLoop = function() {
    const rotate = () => {
        if (this.state.isRotating && !this.state.userInteracting) {
            const center = this.state.map.getCenter();
            center.lng -= 0.15; // Profesyonel, yormayan rotasyon hızı
            this.state.map.easeTo({ center, duration: 250, easing: n => n });
        }
        requestAnimationFrame(rotate);
    };
    rotate();
};

