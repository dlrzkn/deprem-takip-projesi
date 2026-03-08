/**
 * SEISMO-PRO CORE & DATA ENGINE
 */
const SeismoEngine = {
    config: {
        token: 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q',
        mapStyle: 'mapbox://styles/mapbox/dark-v11',
        refreshInterval: 120000,
        plateBoundariesUrl: 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json'
    },
    state: {
        map: null,
        rawEvents: [],
        filteredEvents: [],
        minMag: 0,
        depthFilter: 'all'
    },

    init() {
        mapboxgl.accessToken = this.config.token;
        this.state.map = new mapboxgl.Map({
            container: 'map',
            style: this.config.mapStyle,
            center: [35, 39],
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
            this.attachUIListeners();
        });
    },

    setupAtmosphere() {
        this.state.map.setFog({
            'range': [0.5, 10],
            'color': '#0a0c10',
            'high-color': '#161c24',
            'space-color': '#000000',
            'horizon-blend': 0.02
        });
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
                paint: { 'line-color': '#ff4d4d', 'line-width': 1.5, 'line-opacity': 0.3, 'line-dasharray': [2, 2] }
            });
        } catch (e) { console.warn("Levha sınırları yüklenemedi:", e); }
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
    },

    async fetchSeismicData() {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) statusEl.innerText = "Veri Alınıyor...";
        
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
                    const data = res.value.features || res.value;
                    unifiedFeatures.push(...this.normalizeData(data, endpoints[index].id));
                }
            });
            this.state.rawEvents = this.deduplicateEvents(unifiedFeatures);
            this.processAnalytics();
            this.updateUI();
            if (statusEl) statusEl.innerText = "Sinyal: Güçlü";
        } catch (err) {
            if (statusEl) statusEl.innerText = "Bağlantı Hatası";
        }
    }
};


/**
 * SEISMO-PRO ANALYSIS & VISUAL ENGINE
 */
SeismoEngine.normalizeData = function(data, source) {
    const list = Array.isArray(data) ? data : [];
    return list.map(item => {
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

SeismoEngine.deduplicateEvents = function(events) {
    const cleanList = [];
    events.forEach(event => {
        const isDuplicate = cleanList.some(ex => 
            Math.abs(ex.time - event.time) < 60000 && 
            Math.abs(ex.coordinates[0] - event.coordinates[0]) < 0.5
        );
        if (!isDuplicate) cleanList.push(event);
    });
    return cleanList;
};

SeismoEngine.calculateEnergy = function(mag) {
    if (mag <= 0) return 0;
    return Math.pow(10, 4.8 + (1.5 * mag));
};

SeismoEngine.processAnalytics = function() {
    let totalJoule = 0;
    this.state.rawEvents.forEach(ev => totalJoule += this.calculateEnergy(ev.mag));
    const energyEl = document.getElementById('total-energy');
    if (energyEl) energyEl.innerText = `${(totalJoule / 1e12).toFixed(2)} TJ`;
};

SeismoEngine.initLayers = function() {
    const map = this.state.map;
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

    map.addLayer({
        id: 'unclustered-point', type: 'circle', source: 'seismic-events', filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-color': ['interpolate', ['linear'], ['get', 'depth'], 0, '#ff4d4d', 70, '#f1c40f', 300, '#3498db'],
            'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 4, 5, 12, 7, 25],
            'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.8
        }
    });
};

SeismoEngine.getMagColor = function(mag) {
    if (mag >= 7) return '#c0392b';
    if (mag >= 5) return '#e67e22';
    if (mag >= 3) return '#f1c40f';
    return '#2ecc71';
};




/**
 * SEISMO-PRO INTERFACE & EVENT ENGINE
 */
SeismoEngine.attachEventHandlers = function() {
    const map = this.state.map;
    map.on('click', 'unclustered-point', (e) => {
        const props = e.features[0].properties;
        const energy = this.calculateEnergy(props.mag).toExponential(2);
        new mapboxgl.Popup({ offset: 15 })
            .setLngLat(e.features[0].geometry.coordinates)
            .setHTML(`
                <div class="popup-card">
                    <div class="popup-header" style="background: ${this.getMagColor(props.mag)}">
                        <strong>M<sub>w</sub> ${parseFloat(props.mag).toFixed(1)}</strong>
                        <span>${props.source}</span>
                    </div>
                    <div class="popup-body" style="padding: 10px; color: #333;">
                        <p style="margin: 5px 0;"><strong>Bölge:</strong> ${props.place}</p>
                        <p style="margin: 5px 0;"><strong>Derinlik:</strong> ${props.depth} km</p>
                        <p style="margin: 5px 0;"><strong>Enerji:</strong> ${energy} J</p>
                    </div>
                </div>
            `).addTo(map);
    });
    map.on('mouseenter', 'unclustered-point', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'unclustered-point', () => map.getCanvas().style.cursor = '');
};

SeismoEngine.updateUI = function() {
    const minMag = parseFloat(this.state.minMag);
    this.state.filteredEvents = this.state.rawEvents.filter(ev => {
        const mMatch = ev.mag >= minMag;
        const dMatch = this.state.depthFilter === 'all' || (this.state.depthFilter === 'shallow' ? ev.depth < 70 : ev.depth >= 70);
        return mMatch && dMatch;
    });

    this.renderList();
    this.updateMapSource();
};

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
        node.innerHTML = `
            <div class="mag-circle" style="border-color: ${color}; color: ${color}">${ev.mag.toFixed(1)}</div>
            <div class="node-details">
                <div class="node-title" style="font-weight: 600; font-size: 13px;">${ev.place}</div>
                <div class="node-meta" style="font-size: 11px; color: #888;">
                    <span>${ev.depth} km</span> • <span>${new Date(ev.time).toLocaleTimeString('tr-TR')}</span>
                </div>
            </div>`;
        node.onclick = () => this.state.map.flyTo({ center: ev.coordinates, zoom: 8 });
        container.appendChild(node);
    });
};

SeismoEngine.attachUIListeners = function() {
    document.getElementById('mag-range')?.addEventListener('input', (e) => {
        this.state.minMag = e.target.value;
        const display = document.getElementById('mag-value');
        if (display) display.innerText = `${e.target.value}+`;
        this.updateUI();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.state.depthFilter = e.target.dataset.depth;
            this.updateUI();
        });
    });

    document.getElementById('plate-boundaries')?.addEventListener('change', (e) => {
        const visibility = e.target.checked ? 'visible' : 'none';
        if (this.state.map.getLayer('plates-layer')) {
            this.state.map.setLayoutProperty('plates-layer', 'visibility', visibility);
        }
    });

    setInterval(() => {
        const clock = document.getElementById('clock');
        if (clock) clock.innerText = new Date().toLocaleTimeString('tr-TR');
    }, 1000);
};

SeismoEngine.updateMapSource = function() {
    const geojson = { type: 'FeatureCollection', features: this.state.filteredEvents.map(ev => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: ev.coordinates }, properties: ev
    }))};
    if (this.state.map.getSource('seismic-events')) {
        this.state.map.getSource('seismic-events').setData(geojson);
    }
};

// Uygulamayı başlat
document.addEventListener('DOMContentLoaded', () => {
    if (typeof SeismoEngine !== 'undefined') {
        SeismoEngine.init();
    }
});


