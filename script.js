/**
 * SEISMO-PRO CORE & DATA ENGINE (V5.0)
 * Profesyonel Sismik Analiz Terminali - Tam Sürüm
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
        // 0: En Güncel, 1: Büyükten Küçüğe, 2: Küçükten Büyüğe
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

        // Rotasyon Durdurma Mantığı
        const stopRotation = () => {
            this.state.userInteracting = true;
            clearTimeout(this.state.rotationTimeout);
            this.state.rotationTimeout = setTimeout(() => {
                this.state.userInteracting = false;
            }, 5000);
        };

        ['mousedown', 'touchstart', 'wheel', 'dragstart'].forEach(ev => {
            this.state.map.on(ev, stopRotation);
        });
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
        // Kümeleme Katmanı
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
        // Tekil Deprem Noktaları
        map.addLayer({
            id: 'unclustered-point', type: 'circle', source: 'seismic-events', filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': ['interpolate', ['linear'], ['get', 'depth'], 0, '#ff4d4d', 70, '#f1c40f', 300, '#3498db'],
                'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 4, 5, 12, 7, 25],
                'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.8
            }
        });
    },

    normalizeData(data, source) {
        return data.map(item => {
            const props = item.properties || item;
            const coords = item.geometry ? item.geometry.coordinates : [item.longitude, item.latitude];
            let placeName = props.place || props.region || props.flynn_region || "Bilinmeyen Bölge";
            
            // Kaynak bazlı Link Oluşturma
            let externalUrl = "#";
            if (source === 'USGS') externalUrl = `https://earthquake.usgs.gov/earthquakes/eventpage/${props.code || props.id}`;
            else if (source === 'EMSC') externalUrl = `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${props.unid}`;

            return {
                id: props.unid || props.id || Math.random(),
                mag: parseFloat(props.mag || props.magnitude || 0),
                depth: parseFloat(props.depth || props.depth_mag || 0),
                place: placeName,
                time: new Date(props.time || props.m_time).getTime(),
                source: source,
                url: externalUrl,
                coordinates: [parseFloat(coords[0]), parseFloat(coords[1])]
            };
        });
    },

    async fetchSeismicData() {
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
    },

    deduplicateEvents(events) {
        const cleanList = [];
        events.sort((a, b) => b.mag - a.mag);
        events.forEach(event => {
            const isDuplicate = cleanList.some(ex => 
                Math.abs(ex.time - event.time) < 120000 && 
                Math.abs(ex.coordinates[0] - event.coordinates[0]) < 0.8 &&
                Math.abs(ex.coordinates[1] - event.coordinates[1]) < 0.8
            );
            if (!isDuplicate) cleanList.push(event);
        });
        return cleanList;
    },

    updateUI() {
        // Filtreleme
        this.state.filteredEvents = this.state.rawEvents.filter(ev => {
            const mMatch = ev.mag >= this.state.minMag;
            const dMatch = this.state.depthFilter === 'all' || 
                (this.state.depthFilter === 'shallow' ? ev.depth < 70 : ev.depth >= 70);
            return mMatch && dMatch;
        });

        // Üçlü Sıralama Döngüsü
        const mode = this.state.sortMode;
        this.state.filteredEvents.sort((a, b) => {
            if (mode === 0) return b.time - a.time; // En Yeni
            if (mode === 1) return b.mag - a.mag;   // Büyükten Küçüğe
            if (mode === 2) return a.mag - b.mag;   // Küçükten Büyüğe
            return 0;
        });

        this.renderList();
        this.renderDepthChart();
        this.updateMapSource();
    },

    renderList() {
        const container = document.getElementById('earthquake-feed');
        const countLabel = document.getElementById('event-count');
        if (!container) return;
        container.innerHTML = '';
        if (countLabel) countLabel.innerText = `${this.state.filteredEvents.length} Olay Listeleniyor`;

        this.state.filteredEvents.forEach(ev => {
            const node = document.createElement('div');
            node.className = 'earthquake-node';
            node.innerHTML = `
                <div class="mag-circle" style="border-color: ${this.getMagColor(ev.mag)}; color: ${this.getMagColor(ev.mag)}">${ev.mag.toFixed(1)}</div>
                <div class="node-details">
                    <div class="node-title">${ev.place}</div>
                    <div class="node-meta">${ev.depth > 0 ? ev.depth + ' km' : 'Sığ'} • ${new Date(ev.time).toLocaleTimeString('tr-TR')}</div>
                </div>`;
            node.onclick = () => { 
                this.state.userInteracting = true; 
                this.state.map.flyTo({ center: ev.coordinates, zoom: 8 }); 
            };
            container.appendChild(node);
        });
    },

    renderDepthChart() {
        const container = document.getElementById('depth-analysis');
        if (!container) return;
        const shallow = this.state.filteredEvents.filter(ev => ev.depth < 70).length;
        const deep = this.state.filteredEvents.filter(ev => ev.depth >= 70).length;
        const total = this.state.filteredEvents.length || 1;

        container.innerHTML = `
            <div class="depth-stat">Sığ (<70km): %${((shallow/total)*100).toFixed(1)}</div>
            <div class="depth-stat">Derin (>70km): %${((deep/total)*100).toFixed(1)}</div>
        `;
    },

    updateMapSource() {
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
    },

    attachUIListeners() {
        // Sıralama Butonu Döngüsü
        const sortBtn = document.getElementById('sort-btn');
        if (sortBtn) {
            sortBtn.addEventListener('click', () => {
                this.state.sortMode = (this.state.sortMode + 1) % 3;
                const labels = ["🕒 En Güncel", "📉 Büyükten Küçüğe", "📈 Küçükten Büyüğe"];
                sortBtn.innerText = labels[this.state.sortMode];
                this.updateUI();
            });
        }

        // Minimum Büyüklük Slider
        const slider = document.getElementById('mag-slider');
        if (slider) {
            slider.addEventListener('input', (e) => {
                this.state.minMag = parseFloat(e.target.value);
                const valDisplay = document.getElementById('mag-value');
                if (valDisplay) valDisplay.innerText = this.state.minMag + '+';
                this.updateUI();
            });
        }

        // Rotasyon Toggle
        const rotBtn = document.getElementById('rotation-toggle');
        if (rotBtn) {
            rotBtn.addEventListener('click', () => {
                this.state.isRotating = !this.state.isRotating;
                rotBtn.classList.toggle('active');
                rotBtn.innerText = this.state.isRotating ? "🔄 Rotasyon: AÇIK" : "📍 Rotasyon: KAPALI";
            });
        }

        // Zaman Filtreleri
        document.querySelectorAll('[data-time]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.state.timeRange = e.target.dataset.time;
                this.fetchSeismicData();
            });
        });
    },

    attachEventHandlers() {
        const map = this.state.map;
        map.on('click', 'unclustered-point', (e) => {
            this.state.userInteracting = true;
            const p = e.features[0].properties;
            const popupHTML = `
                <div class="popup-card">
                    <div style="background:${this.getMagColor(p.mag)};color:#fff;padding:5px;border-radius:4px"><strong>M<sub>w</sub> ${parseFloat(p.mag).toFixed(1)}</strong></div>
                    <p><strong>Bölge:</strong> ${p.place}</p>
                    <p><strong>Derinlik:</strong> ${p.depth} km</p>
                    <p><strong>Kaynak:</strong> ${p.source}</p>
                    <a href="${p.url}" target="_blank" style="color:#3498db;text-decoration:none">Detaylı Bilgi ↗</a>
                </div>`;
            new mapboxgl.Popup({ offset: 15 }).setLngLat(e.features[0].geometry.coordinates).setHTML(popupHTML).addTo(map);
        });
    },

    startRotationLoop() {
        const rotate = () => {
            if (this.state.isRotating && !this.state.userInteracting) {
                const center = this.state.map.getCenter();
                center.lng -= 0.15;
                this.state.map.easeTo({ center, duration: 250, easing: n => n });
            }
            requestAnimationFrame(rotate);
        };
        rotate();
    },

    getMagColor(mag) {
        if (mag >= 7) return '#c0392b';
        if (mag >= 5) return '#e67e22';
        if (mag >= 3) return '#f1c40f';
        return '#2ecc71';
    },

    initClock() {
        setInterval(() => {
            const clockEl = document.getElementById('clock');
            if (clockEl) clockEl.innerText = new Date().toLocaleTimeString('tr-TR');
        }, 1000);
    },

    processAnalytics() {
        let totalJoule = 0;
        this.state.rawEvents.forEach(ev => {
            if (ev.mag > 0) totalJoule += Math.pow(10, 4.8 + (1.5 * ev.mag));
        });
        const energyEl = document.getElementById('total-energy');
        if (energyEl) energyEl.innerText = `${(totalJoule / 1e12).toFixed(2)} TJ`;
    },

    startDataCycle() {
        this.fetchSeismicData();
        setInterval(() => this.fetchSeismicData(), this.config.refreshInterval);
    },

    loadPlateBoundaries() {
        fetch(this.config.plateBoundariesUrl).then(r => r.json()).then(data => {
            this.state.map.addSource('plates', { type: 'geojson', data: data });
            this.state.map.addLayer({ id: 'plates-layer', type: 'line', source: 'plates', paint: { 'line-color': '#ff4d4d', 'line-width': 1.5, 'line-opacity': 0.4 } });
        }).catch(() => {});
    }
};

document.addEventListener('DOMContentLoaded', () => SeismoEngine.init());
