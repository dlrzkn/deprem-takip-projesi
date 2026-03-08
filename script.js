/**
 * SEISMO-PRO CORE & DATA ENGINE (V3.0)
 * Tüm fonksiyonları doğrulanmış ve optimize edilmiş sürüm.
 */
const SeismoEngine = {
    config: {
        token: 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q',
        mapStyle: {
            dark: 'mapbox://styles/mapbox/dark-v11',
            light: 'mapbox://styles/mapbox/light-v11'
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
        rotationTimeout: null
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
            // Stil değiştiğinde kaynakları ve katmanları yeniden oluştur
            this.initSources();
            this.initLayers();
            this.updateMapSource();
            this.loadPlateBoundaries();
        });

        this.state.map.on('load', () => {
            this.attachEventHandlers();
            this.startDataCycle();
            this.attachUIListeners();
            this.startRotationLoop();
        });

        const stopRotation = () => {
            this.state.userInteracting = true;
            clearTimeout(this.state.rotationTimeout);
            this.state.rotationTimeout = setTimeout(() => {
                this.state.userInteracting = false;
            }, 5000);
        };

        this.state.map.on('mousedown', stopRotation);
        this.state.map.on('touchstart', stopRotation);
        this.state.map.on('wheel', stopRotation);
        this.state.map.on('dragstart', stopRotation);
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

    startRotationLoop() {
        const rotate = () => {
            if (this.state.isRotating && !this.state.userInteracting) {
                const center = this.state.map.getCenter();
                center.lng -= 0.1;
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
            if (this.state.map.getSource('plates')) {
                this.state.map.getSource('plates').setData(data);
            } else {
                this.state.map.addSource('plates', { type: 'geojson', data: data });
                this.state.map.addLayer({
                    id: 'plates-layer',
                    type: 'line',
                    source: 'plates',
                    paint: { 'line-color': '#ff4d4d', 'line-width': 1.2, 'line-opacity': 0.4 }
                });
            }
        } catch (e) { console.warn("Levha sınırları yüklenemedi."); }
    },

    startDataCycle() {
        this.fetchSeismicData();
        setInterval(() => this.fetchSeismicData(), this.config.refreshInterval);
    },

    async fetchSeismicData() {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) statusEl.innerText = "Veri Alınıyor...";
        
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
                    const data = res.value.features || (Array.isArray(res.value) ? res.value : []);
                    unifiedFeatures.push(...this.normalizeData(data, endpoints[index].id));
                }
            });

            this.state.rawEvents = this.deduplicateEvents(unifiedFeatures);
            this.processAnalytics();
            this.updateUI();
            if (statusEl) statusEl.innerText = "Sinyal: Güçlü";
        } catch (err) {
            if (statusEl) statusEl.innerText = "Bağlantı Kesildi";
        }
    },

    normalizeData(data, source) {
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
                coordinates: [parseFloat(coords[0]), parseFloat(coords[1])]
            };
        });
    },

    deduplicateEvents(events) {
        const cleanList = [];
        events.forEach(event => {
            const isDuplicate = cleanList.some(ex => 
                Math.abs(ex.time - event.time) < 120000 && 
                Math.abs(ex.coordinates[0] - event.coordinates[0]) < 0.8
            );
            if (!isDuplicate) cleanList.push(event);
        });
        return cleanList;
    },

    calculateEnergy(mag) {
        return mag > 0 ? Math.pow(10, 4.8 + (1.5 * mag)) : 0;
    },

    processAnalytics() {
        let totalJoule = 0;
        this.state.rawEvents.forEach(ev => totalJoule += this.calculateEnergy(ev.mag));
        const energyEl = document.getElementById('total-energy');
        if (energyEl) energyEl.innerText = `${(totalJoule / 1e12).toFixed(2)} TJ`;
    },

    initSources() {
        if (!this.state.map.getSource('seismic-events')) {
            this.state.map.addSource('seismic-events', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
                cluster: true,
                clusterMaxZoom: 10,
                clusterRadius: 50
            });
        }
    },

    initLayers() {
        const map = this.state.map;
        if (!map.getLayer('clusters')) {
            map.addLayer({
                id: 'clusters', type: 'circle', source: 'seismic-events', filter: ['has', 'point_count'],
                paint: {
                    'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 10, '#f1f075', 30, '#f28cb1'],
                    'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 30, 40],
                    'circle-opacity': 0.6
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
        }
    },

    updateUI() {
        const minMag = parseFloat(this.state.minMag);
        this.state.filteredEvents = this.state.rawEvents.filter(ev => {
            const mMatch = ev.mag >= minMag;
            const dMatch = this.state.depthFilter === 'all' || (this.state.depthFilter === 'shallow' ? ev.depth < 70 : ev.depth >= 70);
            return mMatch && dMatch;
        });
        this.renderList();
        this.updateMapSource();
    },

    renderList() {
        const container = document.getElementById('earthquake-feed');
        const countLabel = document.getElementById('event-count');
        if (!container) return;
        container.innerHTML = '';
        if (countLabel) countLabel.innerText = `${this.state.filteredEvents.length} Olay Listeleniyor`;
        
        [...this.state.filteredEvents].sort((a,b) => b.time - a.time).forEach(ev => {
            const node = document.createElement('div');
            node.className = 'earthquake-node';
            const color = this.getMagColor(ev.mag);
            node.innerHTML = `
                <div class="mag-circle" style="border-color: ${color}; color: ${color}">${ev.mag.toFixed(1)}</div>
                <div class="node-details">
                    <div class="node-title" style="font-weight: 600; font-size: 13px;">${ev.place}</div>
                    <div class="node-meta" style="font-size: 11px; color: #888;">
                        <span>${ev.depth > 0 ? ev.depth + ' km' : 'Sığ'}</span> • <span>${new Date(ev.time).toLocaleTimeString('tr-TR')}</span>
                    </div>
                </div>`;
            node.onclick = () => {
                this.state.userInteracting = true;
                this.state.map.flyTo({ center: ev.coordinates, zoom: 8 });
            };
            container.appendChild(node);
        });
    },

    attachUIListeners() {
        document.querySelectorAll('[data-time]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('[data-time]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.state.timeRange = e.target.dataset.time;
                this.fetchSeismicData();
            });
        });

        document.getElementById('theme-toggle')?.addEventListener('click', (e) => {
            const body = document.body;
            this.state.currentTheme = body.classList.contains('light-mode') ? 'dark' : 'light';
            body.classList.toggle('light-mode');
            e.target.innerText = this.state.currentTheme === 'light' ? '🌙 Gece Modu' : '🌓 Gündüz Modu';
            this.state.map.setStyle(this.config.mapStyle[this.state.currentTheme]);
        });

        document.getElementById('rotation-toggle')?.addEventListener('click', (e) => {
            this.state.isRotating = !this.state.isRotating;
            e.target.classList.toggle('active', this.state.isRotating);
            e.target.innerText = this.state.isRotating ? '🌎 Rotasyon: AÇIK' : '🔄 Rotasyon: KAPALI';
        });

        document.getElementById('mag-range')?.addEventListener('input', (e) => {
            this.state.minMag = e.target.value;
            const valLabel = document.getElementById('mag-value');
            if (valLabel) valLabel.innerText = `${e.target.value}+`;
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
    },

    updateMapSource() {
        const geojson = { type: 'FeatureCollection', features: this.state.filteredEvents.map(ev => ({
            type: 'Feature', geometry: { type: 'Point', coordinates: ev.coordinates }, properties: ev
        }))};
        if (this.state.map.getSource('seismic-events')) {
            this.state.map.getSource('seismic-events').setData(geojson);
        }
    },

    getMagColor(mag) {
        if (mag >= 7) return '#c0392b';
        if (mag >= 5) return '#e67e22';
        if (mag >= 3) return '#f1c40f';
        return '#2ecc71';
    },

    attachEventHandlers() {
        const map = this.state.map;
        map.on('click', 'unclustered-point', (e) => {
            this.state.userInteracting = true;
            const props = e.features[0].properties;
            new mapboxgl.Popup({ offset: 15 })
                .setLngLat(e.features[0].geometry.coordinates)
                .setHTML(`
                    <div class="popup-card" style="color: #333; padding: 5px;">
                        <div style="background: ${this.getMagColor(props.mag)}; color: #fff; padding: 5px; border-radius: 4px; margin-bottom: 5px;">
                            <strong>M<sub>w</sub> ${parseFloat(props.mag).toFixed(1)}</strong>
                        </div>
                        <p style="margin: 2px 0;"><strong>Bölge:</strong> ${props.place}</p>
                        <p style="margin: 2px 0;"><strong>Derinlik:</strong> ${props.depth > 0 ? props.depth + ' km' : 'Sığ'}</p>
                    </div>`).addTo(map);
        });
        map.on('mouseenter', 'unclustered-point', () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', 'unclustered-point', () => map.getCanvas().style.cursor = '');
    }
};

document.addEventListener('DOMContentLoaded', () => SeismoEngine.init());
