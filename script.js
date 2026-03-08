/**
 * SEISMO-PRO CORE & DATA ENGINE (V4.2)
 * Profesyonel Sismik Analiz Terminali
 */

const SeismoEngine = {
    config: {
        token: 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q',
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
        rotationTimeout: null,
        sortMode: 0 
    },

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

        const stopRotation = () => {
            this.state.userInteracting = true;
            clearTimeout(this.state.rotationTimeout);
            this.state.rotationTimeout = setTimeout(() => { this.state.userInteracting = false; }, 5000);
        };

        ['mousedown', 'touchstart', 'wheel', 'dragstart'].forEach(ev => this.state.map.on(ev, stopRotation));
    },

    setupAtmosphere() {
        const isDark = this.state.currentTheme === 'dark';
        this.state.map.setFog({
            'range': [0.5, 10],
            'color': isDark ? '#0a0c10' : 'rgba(135, 206, 235, 0.5)',
            'high-color': isDark ? '#161c24' : '#ffffff',
            'space-color': isDark ? '#000000' : '#ffffff',
            'horizon-blend': 0.02
        });
    }
};


SeismoEngine.normalizeData = function(data, source) {
    return data.map(item => {
        const props = item.properties || item;
        const coords = item.geometry ? item.geometry.coordinates : [item.longitude, item.latitude];
        let placeName = props.place || props.region || props.flynn_region || "Bilinmeyen Bölge";
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
};

SeismoEngine.fetchSeismicData = async function() {
    const range = this.state.timeRange;
    const endpoints = [
        { id: 'USGS', url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${range}.geojson` },
        { id: 'EMSC', url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=250' },
        { id: 'GFZ', url: 'https://geofon.gfz.de/fdsnws/event/1/query?format=json&limit=100' }
    ];

    try {
        const responses = await Promise.allSettled(endpoints.map(e => fetch(e.url).then(res => res.json())));
        let unifiedFeatures = [];
        responses.forEach((res, index) => {
            if (res.status === 'fulfilled') {
                const data = res.value.features || (Array.isArray(res.value) ? res.value : []);
                unifiedFeatures.push(...this.normalizeData(data, endpoints[index].id));
            }
        });
        this.state.rawEvents = this.deduplicateEvents(unifiedFeatures);
        this.processAnalytics();
        this.updateUI();
    } catch (err) { console.error("Veri hatası:", err); }
};

SeismoEngine.deduplicateEvents = function(events) {
    const cleanList = [];
    events.sort((a, b) => b.mag - a.mag);
    events.forEach(event => {
        const isDuplicate = cleanList.some(ex => 
            Math.abs(ex.time - event.time) < 120000 && 
            Math.abs(ex.coordinates[0] - event.coordinates[0]) < 0.8
        );
        if (!isDuplicate) cleanList.push(event);
    });
    return cleanList;
};


SeismoEngine.initSources = function() {
    this.state.map.addSource('seismic-events', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true, clusterMaxZoom: 10, clusterRadius: 50
    });
};

SeismoEngine.initLayers = function() {
    const map = this.state.map;
    map.addLayer({
        id: 'unclustered-point', type: 'circle', source: 'seismic-events', filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-color': ['interpolate', ['linear'], ['get', 'depth'], 0, '#ff4d4d', 70, '#f1c40f', 300, '#3498db'],
            'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 4, 5, 12, 7, 25],
            'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.8
        }
    });
};

SeismoEngine.processAnalytics = function() {
    let totalJoule = 0;
    this.state.rawEvents.forEach(ev => {
        if (ev.mag > 0) totalJoule += Math.pow(10, 4.8 + (1.5 * ev.mag));
    });
    const energyEl = document.getElementById('total-energy');
    if (energyEl) energyEl.innerText = `${(totalJoule / 1e12).toFixed(2)} TJ`;
};

SeismoEngine.renderDepthChart = function() {
    const container = document.getElementById('depth-analysis');
    if (!container) return;
    const stats = {
        shallow: this.state.filteredEvents.filter(ev => ev.depth < 70).length,
        inter: this.state.filteredEvents.filter(ev => ev.depth >= 70 && ev.depth < 300).length,
        deep: this.state.filteredEvents.filter(ev => ev.depth >= 300).length
    };
    const total = this.state.filteredEvents.length || 1;
    const getP = (v) => ((v / total) * 100).toFixed(1);
    container.innerHTML = `
        <div class="depth-stat-row">Sığ: %${getP(stats.shallow)}</div>
        <div class="depth-stat-row">Orta: %${getP(stats.inter)}</div>
        <div class="depth-stat-row">Derin: %${getP(stats.deep)}</div>
    `;
};

SeismoEngine.updateUI = function() {
    this.state.filteredEvents = this.state.rawEvents.filter(ev => {
        return ev.mag >= this.state.minMag && (this.state.depthFilter === 'all' || (this.state.depthFilter === 'shallow' ? ev.depth < 70 : ev.depth >= 70));
    });

    const mode = this.state.sortMode;
    this.state.filteredEvents.sort((a, b) => {
        if (mode === 0) return b.time - a.time;
        if (mode === 1) return b.mag - a.mag;
        return a.mag - b.mag;
    });

    this.renderList();
    this.renderDepthChart();
    const geojson = { type: 'FeatureCollection', features: this.state.filteredEvents.map(ev => ({ type: 'Feature', geometry: { type: 'Point', coordinates: ev.coordinates }, properties: ev }))};
    if (this.state.map.getSource('seismic-events')) this.state.map.getSource('seismic-events').setData(geojson);
};

SeismoEngine.attachUIListeners = function() {
    document.getElementById('sort-btn')?.addEventListener('click', (e) => {
        this.state.sortMode = (this.state.sortMode + 1) % 3;
        const lbl = ["🕒 Güncel", "📉 Büyükten Küçüğe", "📈 Küçükten Büyüğe"];
        e.target.innerText = lbl[this.state.sortMode];
        this.updateUI();
    });

    document.getElementById('mag-slider')?.addEventListener('input', (e) => {
        this.state.minMag = parseFloat(e.target.value);
        document.getElementById('mag-value').innerText = this.state.minMag + '+';
        this.updateUI();
    });
};

SeismoEngine.getMagColor = (mag) => mag >= 7 ? '#ff0000' : mag >= 5 ? '#ffa500' : '#00ff00';

SeismoEngine.startRotationLoop = function() {
    const rotate = () => {
        if (this.state.isRotating && !this.state.userInteracting) {
            const center = this.state.map.getCenter();
            center.lng -= 0.15;
            this.state.map.easeTo({ center, duration: 250, easing: n => n });
        }
        requestAnimationFrame(rotate);
    };
    rotate();
};

SeismoEngine.initClock = () => setInterval(() => { if(document.getElementById('clock')) document.getElementById('clock').innerText = new Date().toLocaleTimeString(); }, 1000);
SeismoEngine.startDataCycle = function() { this.fetchSeismicData(); setInterval(() => this.fetchSeismicData(), 120000); };
SeismoEngine.loadPlateBoundaries = async function() {}; // Opsiyonel
SeismoEngine.attachEventHandlers = function() {}; // Pop-up mantığı buraya
SeismoEngine.renderList = function() {}; // Liste basma buraya

// BAŞLAT
document.addEventListener('DOMContentLoaded', () => SeismoEngine.init());

