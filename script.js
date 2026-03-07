const EarthquakeApp = {
    accessToken: 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q',
    map: null,
    currentMag: 0,
    currentRange: 'day',
    allData: [],
    isRotating: true,
    isUserInteracting: false,

    init() {
        mapboxgl.accessToken = this.accessToken;
        this.map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [35, 39],
            zoom: 2.5,
            projection: 'globe',
            dragPan: true,
            touchZoomRotate: true,
            scrollZoom: true,
            dragRotate: true
        });

        this.map.on('style.load', () => {
            this.setupSources();
            this.setupLayers();
            this.setupInteractions();
            this.setupRotation(); // Rotasyonu başlat
            this.fetchData();
        });

        // SONSUZ DÖNGÜ: Her hareket bittiğinde rotasyon açıksa tekrar tetikle
        this.map.on('moveend', () => {
            if (this.isRotating && !this.isUserInteracting) {
                this.setupRotation();
            }
        });
    },

    setupSources() {
        if (this.map.getSource('earthquakes')) return;
        this.map.addSource('earthquakes', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50
        });
    },

    setupLayers() {
        this.map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'earthquakes',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 10, '#f1f075', 30, '#f28cb1'],
                'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 30, 40]
            }
        });

        this.map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'earthquakes',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count}',
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                'text-size': 12
            }
        });

        this.map.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'earthquakes',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': ['step', ['get', 'mag'], '#2ecc71', 3, '#f1c40f', 5, '#e67e22', 7, '#c0392b'],
                'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 6, 8, 25],
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#fff',
                'circle-opacity': 0.9
            }
        });
    },

    async fetchData() {
        const sources = [
            { id: 'EMSC', url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=150', priority: 1 },
            { id: 'USGS', url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${this.currentRange}.geojson`, priority: 2 },
            { id: 'GFZ', url: 'https://geofon.gfz.de/fdsnws/event/1/query?format=json&limit=50', priority: 3 }
        ];

        try {
            const results = await Promise.allSettled(sources.map(s => fetch(s.url).then(r => r.json())));
            let rawFeatures = [];

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    const sInfo = sources[index];
                    const data = result.value.features || (Array.isArray(result.value) ? result.value : []);
                    data.forEach(f => {
                        const props = f.properties || f;
                        const coords = f.geometry ? f.geometry.coordinates : [f.longitude, f.latitude];
                        rawFeatures.push({
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [parseFloat(coords[0]), parseFloat(coords[1])] },
                            properties: {
                                id: props.unid || f.id,
                                mag: parseFloat(props.mag || props.magnitude || 0),
                                place: props.place || props.region || props.flynn_region || "Bilinmeyen Bölge",
                                time: new Date(props.time || props.m_time).getTime(),
                                source: sInfo.id,
                                url: props.url || (sInfo.id === 'EMSC' ? `https://www.emsc-csem.org/event/${props.unid}` : "#")
                            }
                        });
                    });
                }
            });

            this.allData = this.smartDeduplicate(rawFeatures);
            this.updateMapSource();
            this.updateUIStats();
        } catch (e) { console.error(e); }
    },

    smartDeduplicate(data) {
        const final = [];
        data.forEach(item => {
            const isDup = final.some(ex => Math.abs(item.properties.time - ex.properties.time) < 60000);
            if (!isDup) final.push(item);
        });
        return final;
    },

    updateMapSource() {
        const filtered = { type: 'FeatureCollection', features: this.allData.filter(f => f.properties.mag >= this.currentMag) };
        if (this.map.getSource('earthquakes')) this.map.getSource('earthquakes').setData(filtered);
    },

    setupInteractions() {
        this.map.on('click', 'unclustered-point', (e) => {
            const { mag, place, time, url, source } = e.features[0].properties;
            new mapboxgl.Popup({ offset: 15, closeButton: false })
                .setLngLat(e.features[0].geometry.coordinates)
                .setHTML(`
                    <div class="popup-card">
                        <div class="popup-header" style="background: ${mag >= 5 ? '#e67e22' : '#2ecc71'}">
                            <span>${source}</span>
                            <b>${mag.toFixed(1)} Mw</b>
                        </div>
                        <div class="popup-body">
                            <strong>${place}</strong><br>
                            <small>${new Date(time).toLocaleString('tr-TR')}</small>
                        </div>
                        <div class="popup-footer"><a href="${url}" target="_blank">KAYNAK DETAYI ↗</a></div>
                    </div>
                `).addTo(this.map);
        });

        this.map.on('click', 'clusters', (e) => {
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            this.map.getSource('earthquakes').getClusterExpansionZoom(features[0].properties.cluster_id, (err, zoom) => {
                this.map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 1 });
            });
        });

        const stopInt = () => { this.isUserInteracting = true; };
        const startInt = () => { this.isUserInteracting = false; this.setupRotation(); };

        this.map.on('mousedown', stopInt);
        this.map.on('touchstart', stopInt);
        this.map.on('mouseup', startInt);
        this.map.on('touchend', startInt);
    },

    // ROTASYON MANTIĞI: Her seferinde 120 derece döner (daha uzun ve akıcı bir parça)
    setupRotation() {
        if (!this.isRotating || this.map.getZoom() > 5 || this.isUserInteracting) return;
        
        const center = this.map.getCenter();
        center.lng -= 50; // Büyük bir adım atıyoruz
        
        this.map.easeTo({
            center,
            duration: 20000, // 20 saniye boyunca yavaşça döner
            easing: n => n, // Sabit hız
            essential: true
        });
    },

    toggleRotation() {
        this.isRotating = !this.isRotating;
        const btn = document.getElementById('rotation-btn');
        if (btn) {
            btn.innerHTML = this.isRotating ? '🌎 Durdur' : '🔄 Döndür';
            btn.classList.toggle('btn-active', this.isRotating);
        }
        if (!this.isRotating) {
            this.map.stop();
        } else {
            this.isUserInteracting = false;
            this.setupRotation();
        }
    },

    updateUIStats() {
        const stats = this.allData.reduce((acc, curr) => {
            acc[curr.properties.source] = (acc[curr.properties.source] || 0) + 1;
            return acc;
        }, {});
        
        const e = document.querySelector('.tag-emsc');
        const u = document.querySelector('.tag-usgs');
        const g = document.querySelector('.tag-gfz');
        if(e) e.innerText = `E: ${stats.EMSC || 0}`;
        if(u) u.innerText = `U: ${stats.USGS || 0}`;
        if(g) g.innerText = `G: ${stats.GFZ || 0}`;
        
        document.getElementById('last-update').innerText = `Güncelleme: ${new Date().toLocaleTimeString('tr-TR')}`;
        this.renderList();
    },

    renderList() {
        const list = document.getElementById('earthquake-list');
        const count = document.getElementById('list-count');
        if (!list) return;
        list.innerHTML = '';
        
        const filtered = this.allData.filter(f => f.properties.mag >= this.currentMag)
                                     .sort((a,b) => b.properties.time - a.properties.time);

        if(count) count.innerText = `${filtered.length} Kayıt`;

        filtered.slice(0, 50).forEach(f => {
            const { mag, place, time, source } = f.properties;
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="list-item-header">
                    <b style="color:${mag >= 5 ? '#e67e22' : '#2ecc71'}; font-size: 13px;">${mag.toFixed(1)} Mw</b>
                    <span class="list-source-tag">${source}</span>
                </div>
                <div class="place-text">${place}</div>
                <div class="time-text">${new Date(time).toLocaleTimeString('tr-TR')}</div>
            `;
            item.onclick = () => this.map.flyTo({ center: f.geometry.coordinates, zoom: 8 });
            list.appendChild(item);
        });
    },

    changeMag(m, e) { this.currentMag = m; this.updateBtnGroup('.mag-btn', e.target); this.updateMapSource(); this.renderList(); },
    changeTime(r, e) { this.currentRange = r; this.updateBtnGroup('.time-btn', e.target); this.fetchData(); },
    updateBtnGroup(s, t) { document.querySelectorAll(s).forEach(b => b.classList.remove('btn-active')); if(t) t.classList.add('btn-active'); },
    toggleTheme() {
        const isDark = this.map.getStyle().name.includes('Dark');
        this.map.setStyle('mapbox://styles/mapbox/' + (isDark ? 'streets-v12' : 'dark-v11'));
        this.map.once('style.load', () => { this.setupSources(); this.setupLayers(); this.updateMapSource(); });
    }
};

EarthquakeApp.init();
setInterval(() => EarthquakeApp.fetchData(), 120000);

