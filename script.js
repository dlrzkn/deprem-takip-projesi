// Mapbox Token
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], 
    zoom: 2.2, 
    projection: 'globe'
});

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day';

// 1. VERİ ÇEKME (Üçlü Akış)
async function fetchData() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    // Kaynaklar (Öncelik sırasına göre)
    const sources = [
        { id: 'EMSC', url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=100', priority: 0 },
        { id: 'USGS', url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${currentRange}.geojson`, priority: 1 },
        { id: 'GFZ', url: 'https://geofon.gfz.de/fdsnws/event/1/query?format=json&limit=50', priority: 2 }
    ];

    try {
        const results = await Promise.allSettled(sources.map(s => fetch(s.url).then(r => r.json())));
        let mergedFeatures = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const sInfo = sources[index];
                // API farklılıklarına göre veriyi standardize et
                const rawData = result.value.features || (Array.isArray(result.value) ? result.value : []);
                
                const standardized = rawData.map(f => {
                    const props = f.properties || f;
                    const coords = f.geometry ? f.geometry.coordinates : [f.longitude, f.latitude];
                    
                    return {
                        sourceId: sInfo.id,
                        priority: sInfo.priority,
                        geometry: { coordinates: [parseFloat(coords[0]), parseFloat(coords[1])] },
                        properties: {
                            mag: parseFloat(props.mag || props.magnitude || 0),
                            place: props.place || props.region || "Bilinmeyen Bölge",
                            time: new Date(props.time || props.m_time).getTime(),
                            url: props.url || (f.id ? `https://www.emsc-csem.org/event/${f.id}` : "#")
                        }
                    };
                });
                mergedFeatures = [...mergedFeatures, ...standardized];
            }
        });

        // Akıllı Tekilleştirme Uygula
        allData = smartDeduplicate(mergedFeatures);
        render();
        
        // İstatistikleri Göster (Kaç kurumdan ne geldiğini görmek için)
        const stats = allData.reduce((acc, curr) => {
            acc[curr.sourceId] = (acc[curr.sourceId] || 0) + 1;
            return acc;
        }, {});

        const updateEl = document.getElementById('last-update');
        if(updateEl) {
            updateEl.innerText = `E:${stats.EMSC || 0} U:${stats.USGS || 0} G:${stats.GFZ || 0} | ${new Date().toLocaleTimeString('tr-TR')}`;
        }
    } catch (e) { 
        console.error("Veri hatası:", e); 
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

// 2. AKILLI TEKİLLEŞTİRME (Hassaslaştırılmış Ayarlar)
function smartDeduplicate(data) {
    data.sort((a, b) => a.priority - b.priority);
    const final = [];
    
    const TIME_TOLERANCE = 45000; // 45 Saniye (Daha fazlası farklı deprem sayılır)
    const DIST_TOLERANCE = 0.4;   // Yaklaşık 40km koordinat sapması

    data.forEach(item => {
        const isDuplicate = final.some(existing => {
            const tDiff = Math.abs(item.properties.time - existing.properties.time);
            const dDiff = Math.sqrt(
                Math.pow(item.geometry.coordinates[0] - existing.geometry.coordinates[0], 2) +
                Math.pow(item.geometry.coordinates[1] - existing.geometry.coordinates[1], 2)
            );
            return tDiff < TIME_TOLERANCE && dDiff < DIST_TOLERANCE;
        });
        if (!isDuplicate) final.push(item);
    });
    return final;
}

// 3. EKRANA BASMA (Render)
function render() {
    // 1. Mevcut markerları temizle
    markers.forEach(m => m.remove());
    
    // 2. Filtrelenmiş veriyi hazırla
    const filteredData = allData.filter(f => f.properties.mag >= currentMag);

    // 3. Harita Markerlarını Oluştur
    markers = filteredData.map(f => {
        const { mag, place, time, url } = f.properties;
        const source = f.sourceId;
        const color = mag >= 7 ? '#c0392b' : mag >= 5 ? '#e67e22' : mag >= 3 ? '#f1c40f' : '#2ecc71';

        const el = document.createElement('div');
        el.className = 'sismic-marker';
        const size = Math.max(mag * 4 + 8, 12);
        el.style.cssText = `background:${color}; width:${size}px; height:${size}px; border:2px solid #fff;`;

        const popupHTML = `
            <div style="font-family:sans-serif; min-width:160px; color:#000; padding:5px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span class="source-tag tag-${source.toLowerCase()}">${source}</span>
                    <b style="color:${color}">${mag.toFixed(1)} Mw</b>
                </div>
                <strong style="display:block; font-size:12px; margin-bottom:5px;">${place}</strong>
                <small style="color:#666;">${new Date(time).toLocaleString('tr-TR')}</small>
                <a href="${url}" target="_blank" style="display:block; margin-top:8px; text-align:center; background:#333; color:#fff; text-decoration:none; padding:5px; border-radius:4px; font-size:10px;">DETAYLAR ↗</a>
            </div>
        `;

        return new mapboxgl.Marker(el)
            .setLngLat(f.geometry.coordinates)
            .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(popupHTML))
            .addTo(map);
    });

    // 4. Sol taraftaki listeyi güncelle
    updateList(filteredData);
}

// Listeyi güncelleyen yardımcı fonksiyonu da render'ın hemen altına ekle:
function updateList(data) {
    const listContainer = document.getElementById('earthquake-list');
    const countEl = document.getElementById('list-count');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    // Veriyi zamana göre sırala (En yeni en üstte)
    const sortedData = [...data].sort((a, b) => b.properties.time - a.properties.time);
    
    if (countEl) countEl.innerText = `${sortedData.length} Deprem`;

    sortedData.slice(0, 30).forEach(f => {
        const { mag, place, time } = f.properties;
        const color = mag >= 7 ? '#c0392b' : mag >= 5 ? '#e67e22' : mag >= 3 ? '#f1c40f' : '#2ecc71';
        
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="list-item-top">
                <span class="list-mag" style="color:${color}">${mag.toFixed(1)}</span>
                <span class="source-tag tag-${f.sourceId.toLowerCase()}" style="font-size:8px;">${f.sourceId}</span>
            </div>
            <span class="list-place">${place}</span>
            <small style="font-size:9px; color:#888;">${new Date(time).toLocaleTimeString('tr-TR')}</small>
        `;
        
        // Listeye tıklandığında haritada o depreme git ve popup'ı aç
        item.onclick = () => {
            map.flyTo({ 
                center: f.geometry.coordinates, 
                zoom: 8, 
                duration: 1500,
                essential: true 
            });
        };
        
        listContainer.appendChild(item);
    });
}


// 4. YARDIMCI FONKSİYONLAR
function rotate() { if (!isRotating || map.getZoom() > 5) return; const center = map.getCenter(); center.lng -= 1.2; map.easeTo({ center, duration: 1000, easing: n => n }); }
map.on('moveend', () => { if(isRotating) rotate(); });
function toggleRotation() { isRotating = !isRotating; const btn = document.getElementById('rotation-btn'); if(btn) btn.innerHTML = isRotating ? '🌎 Durdur' : '🔄 Döndür'; if(isRotating) rotate(); }
function changeTime(r) { currentRange = r; updateBtn('.time-btn', event.target); fetchData(); }
function changeMag(m) { currentMag = m; updateBtn('.mag-btn', event.target); render(); }
function updateBtn(cls, target) { document.querySelectorAll(cls).forEach(b => b.classList.remove('btn-active')); if(target) target.classList.add('btn-active'); }
function toggleTheme() { const isDark = map.getStyle().name.includes('Dark'); map.setStyle('mapbox://styles/mapbox/' + (isDark ? 'streets-v12' : 'dark-v11')); }

map.on('style.load', () => { map.setFog({}); rotate(); fetchData(); });
setInterval(fetchData, 120000);

