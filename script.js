const EarthquakeApp = {
    accessToken: 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q',
    map: null,
    currentMag: 0,
    currentRange: 'day',
    allData: [],

    // Uygulamayı başlatan ana fonksiyon
    init() {
        mapboxgl.accessToken = this.accessToken;
        this.map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [35, 39],
            zoom: 2.5,
            projection: 'globe'
        });

        // Harita stili yüklendiğinde tüm alt sistemleri çalıştır
        this.map.on('style.load', () => {
            this.setupSources();      // Bölüm 1
            this.setupLayers();       // Bölüm 1
            this.setupInteractions();  // Bölüm 3
            this.setupRotation();     // Bölüm 3
            this.fetchData();         // Bölüm 2
        });
    },


        // Rotasyon ve etkileşim ayarlarını buraya taşıyacağız
    },

    setupSources() {
        // Veriyi tutacak ana kaynak. Cluster (kümeleme) aktif.
        this.map.addSource('earthquakes', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50
        });
    },

    setupLayers() {
        // 1. Kümelenmiş (Cluster) Depremler
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

        // 2. Küme Sayıları (Text)
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

        // 3. Tekil Depremler (Unclustered Points)
        this.map.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'earthquakes',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': [
                    'step', ['get', 'mag'],
                    '#2ecc71', 3, '#f1c40f', 5, '#e67e22', 7, '#c0392b'
                ],
                'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 4, 8, 20],
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff',
                'circle-opacity': 0.8
            }
        });
    }
};

EarthquakeApp.init();



    // Mesafe hesaplama (Haversine Formülü) - Jeofiziksel doğruluk için
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Dünya yarıçapı (km)
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Kilometre cinsinden sonuç
    },

    async fetchData() {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'flex';

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
                        const eventId = props.unid || f.id;
                        
                        // Link oluşturma mantığı
                        let url = props.url || "#";
                        if (sInfo.id === 'EMSC' && eventId) url = `https://www.emsc-csem.org/event/${eventId}`;

                        rawFeatures.push({
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [parseFloat(coords[0]), parseFloat(coords[1])] },
                            properties: {
                                id: eventId,
                                mag: parseFloat(props.mag || props.magnitude || 0),
                                place: props.place || props.region || props.flynn_region || "Bilinmeyen Bölge",
                                time: new Date(props.time || props.m_time).getTime(),
                                source: sInfo.id,
                                priority: sInfo.priority,
                                url: url
                            }
                        });
                    });
                }
            });

            this.allData = this.smartDeduplicate(rawFeatures);
            this.updateMapSource();
            this.updateUIStats();
            
        } catch (error) {
            console.error("Veri senkronizasyon hatası:", error);
        } finally {
            if (loader) loader.style.display = 'none';
        }
    },

    smartDeduplicate(data) {
        // Önce önceliğe göre sırala (EMSC > USGS > GFZ gibi)
        data.sort((a, b) => a.properties.priority - b.properties.priority);
        
        const final = [];
        data.forEach(item => {
            const isDuplicate = final.some(existing => {
                const tDiff = Math.abs(item.properties.time - existing.properties.time);
                // 50km ve 60 saniye tolerans (Jeofiziksel standartlara yakın)
                const dDiff = this.calculateDistance(
                    item.geometry.coordinates[1], item.geometry.coordinates[0],
                    existing.geometry.coordinates[1], existing.geometry.coordinates[0]
                );
                return tDiff < 60000 && dDiff < 50;
            });
            if (!isDuplicate) final.push(item);
        });
        return final;
    },

    updateMapSource() {
        // Filtreleme: Kullanıcının seçtiği büyüklükten küçükleri haritaya gönderme
        const filtered = {
            type: 'FeatureCollection',
            features: this.allData.filter(f => f.properties.mag >= this.currentMag)
        };
        // Harita kaynağını tek seferde güncelle (Performans buradadır)
        if (this.map.getSource('earthquakes')) {
            this.map.getSource('earthquakes').setData(filtered);
        }
    }



    setupInteractions() {
        // Tıklama Olayı: Deprem noktasına tıklandığında popup aç
        this.map.on('click', 'unclustered-point', (e) => {
            const coordinates = e.features[0].geometry.coordinates.slice();
            const { mag, place, time, url, source } = e.features[0].properties;

            // Küre projeksiyonunda koordinat kayması hatasını engelleme
            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
            }

            new mapboxgl.Popup({ offset: 15, closeButton: false })
                .setLngLat(coordinates)
                .setHTML(`
                    <div style="font-family:'Segoe UI', Tahoma, sans-serif; min-width:180px; padding:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span style="background:#eee; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold;">${source}</span>
                            <b style="font-size:16px; color:${mag >= 5 ? '#e67e22' : '#2ecc71'}">${mag.toFixed(1)} Mw</b>
                        </div>
                        <strong style="display:block; font-size:13px; margin-bottom:5px; color:#333;">${place}</strong>
                        <div style="font-size:11px; color:#666; margin-bottom:10px;">
                            ${new Date(time).toLocaleString('tr-TR')}
                        </div>
                        <a href="${url}" target="_blank" style="display:block; text-align:center; background:#2c3e50; color:#fff; text-decoration:none; padding:6px; border-radius:4px; font-size:11px; transition:0.3s;">
                            AFAD / KAYNAK DETAYI ↗
                        </a>
                    </div>
                `)
                .addTo(this.map);
        });

        // Mouse imlecini değiştir (UX iyileştirmesi)
        this.map.on('mouseenter', 'unclustered-point', () => { this.map.getCanvas().style.cursor = 'pointer'; });
        this.map.on('mouseleave', 'unclustered-point', () => { this.map.getCanvas().style.cursor = ''; });

        // Cluster'a (Küme) tıklandığında zoom yap
        this.map.on('click', 'clusters', (e) => {
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const clusterId = features[0].properties.cluster_id;
            this.map.getSource('earthquakes').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                this.map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
            });
        });
    },

    // Akıllı Rotasyon Yönetimi
    isRotating: true,
    isUserInteracting: false,

    setupRotation() {
        const rotate = () => {
            if (!this.isRotating || this.map.getZoom() > 5 || this.isUserInteracting) return;
            const center = this.map.getCenter();
            center.lng -= 0.8; // Dönüş hızı
            this.map.easeTo({ center, duration: 1000, easing: n => n });
        };

        this.map.on('mousedown', () => { this.isUserInteracting = true; });
        this.map.on('mouseup', () => { this.isUserInteracting = false; rotate(); });
        this.map.on('moveend', () => { rotate(); });

        // İlk başlatma
        rotate();
    },

    toggleRotation() {
        this.isRotating = !this.isRotating;
        const btn = document.getElementById('rotation-btn');
        if (btn) btn.innerHTML = this.isRotating ? '🌎 Durdur' : '🔄 Döndür';
        if (this.isRotating) { this.isUserInteracting = false; this.map.setZoom(2.5); }
    }



    updateUIStats() {
        // İstatistik hesaplama (Reduce ile verimli gruplama)
        const stats = this.allData.reduce((acc, curr) => {
            acc[curr.properties.source] = (acc[curr.properties.source] || 0) + 1;
            return acc;
        }, {});

        const updateEl = document.getElementById('last-update');
        if (updateEl) {
            const time = new Date().toLocaleTimeString('tr-TR');
            updateEl.innerHTML = `
                <span class="stat-tag">EMSC: ${stats.EMSC || 0}</span>
                <span class="stat-tag">USGS: ${stats.USGS || 0}</span>
                <span class="stat-tag">GFZ: ${stats.GFZ || 0}</span>
                <span class="update-time">| ${time}</span>
            `;
        }
        this.renderList();
    },

    renderList() {
        const listContainer = document.getElementById('earthquake-list');
        const countEl = document.getElementById('list-count');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        const filteredData = this.allData
            .filter(f => f.properties.mag >= this.currentMag)
            .sort((a, b) => b.properties.time - a.properties.time);

        if (countEl) countEl.innerText = `${filteredData.length} Deprem Listeleniyor`;

        // Sadece ilk 40 depremi göster (Performans için limit)
        filteredData.slice(0, 40).forEach(f => {
            const { mag, place, time, source } = f.properties;
            const color = mag >= 7 ? '#c0392b' : mag >= 5 ? '#e67e22' : mag >= 3 ? '#f1c40f' : '#2ecc71';
            
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="list-item-header">
                    <span class="mag-badge" style="background:${color}">${mag.toFixed(1)}</span>
                    <span class="source-label">${source}</span>
                </div>
                <div class="list-item-body">
                    <div class="place-text">${place}</div>
                    <div class="time-text">${new Date(time).toLocaleTimeString('tr-TR')}</div>
                </div>
            `;
            
            item.onclick = () => {
                this.map.flyTo({
                    center: f.geometry.coordinates,
                    zoom: 8,
                    speed: 1.2,
                    curve: 1.4,
                    essential: true
                });
            };
            listContainer.appendChild(item);
        });
    },

    // Filtreleme Fonksiyonları
    changeMag(m, event) {
        this.currentMag = m;
        this.updateBtnGroup('.mag-btn', event.target);
        this.updateMapSource(); // Haritadaki noktaları güncelle
        this.renderList();      // Listeyi güncelle
    },

    changeTime(range, event) {
        this.currentRange = range;
        this.updateBtnGroup('.time-btn', event.target);
        this.fetchData(); // Yeni zaman aralığı için API'lere tekrar git
    },

    updateBtnGroup(selector, target) {
        document.querySelectorAll(selector).forEach(b => b.classList.remove('btn-active'));
        if (target) target.classList.add('btn-active');
    },

    toggleTheme() {
        const currentStyle = this.map.getStyle().name;
        const newStyle = currentStyle.includes('Dark') ? 'streets-v12' : 'dark-v11';
        this.map.setStyle('mapbox://styles/mapbox/' + newStyle);
        
        // Stil değişince source ve layer'lar silinir, tekrar yüklemeliyiz
        this.map.once('style.load', () => {
            this.setupSources();
            this.setupLayers();
            this.updateMapSource();
        });
    }
};

// Uygulamayı başlat ve her 2 dakikada bir otomatik güncelle
setInterval(() => EarthquakeApp.fetchData(), 120000);

