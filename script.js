// Mapbox Token
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], 
    zoom: 2.2, 
    projection: 'globe'
});

// Global Değişkenler
let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day';

// 1. VERİ ÇEKME (Üçlü Akış ve Hiyerarşi)
async function fetchData() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    // Kaynak tanımları (Priority: 0 en yüksek)
    const sources = [
    { id: 'EMSC', url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=100', priority: 0 },
    { id: 'USGS', url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${currentRange}.geojson`, priority: 1 },
    { id: 'GFZ', url: 'https://geofon.gfz.de/fdsnws/event/1/query?format=json&limit=50', priority: 2 }
];


    try {
        // Tüm API'lere aynı anda istek at
        const results = await Promise.allSettled(sources.map(s => fetch(s.url).then(r => r.json())));
        
        let mergedFeatures = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.features) {
                const sInfo = sources[index];
                const standardized = result.value.features.map(f => ({
                    ...f,
                    sourceId: sInfo.id,
                    priority: sInfo.priority,
                    properties: {
                        ...f.properties,
                        // Veri isimlerini ortaklaştır (mag, magnitude, place, region vb.)
                        mag: parseFloat(f.properties.mag || f.properties.magnitude || 0),
                        place: f.properties.place || f.properties.region || "Bilinmeyen Bölge",
                        time: new Date(f.properties.time || f.properties.m_time).getTime(),
                        url: f.properties.url || (f.id ? `https://www.emsc-csem.org/event/${f.id}` : "#")
                    }
                }));
                mergedFeatures = [...mergedFeatures, ...standardized];
            }
        });

        // Akıllı Tekilleştirme Uygula
        allData = smartDeduplicate(mergedFeatures);
        render();
        
        const updateEl = document.getElementById('last-update');
        if(updateEl) updateEl.innerText = "Canlı: " + new Date().toLocaleTimeString('tr-TR');

    } catch (e) { 
        console.error("Veri işleme hatası:", e); 
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

// 2. AKILLI TEKİLLEŞTİRME (Deduplication)
function smartDeduplicate(data) {
    // Önce hiyerarşiye (önceliğe) göre diz (0 en üstte kalır)
    data.sort((a, b) => a.priority - b.priority);

    const final = [];
    const TIME_TOLERANCE = 90000; // 1.5 dakika
    const DIST_TOLERANCE = 0.8;   // Koordinat farkı toleransı

    data.forEach(item => {
        // Mevcut listede bu depremle çakışan var mı?
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
    // Mevcut markerları temizle
    markers.forEach(m => m.remove());
    markers = [];

    // Veri yoksa işlemi durdur
    if (!allData || allData.length === 0) return;

    markers = allData
        .filter(f => {
            // Güvenli magnitüd kontrolü
            const m = parseFloat(f.properties?.mag || 0);
            return m >= currentMag;
        })
        .map(f => {
            // Verileri güvenli bir şekilde değişkenlere ata (Optional Chaining kullanarak)
            const mag = parseFloat(f.properties?.mag || 0);
            const place = f.properties?.place || "Bilinmeyen Bölge";
            const time = f.properties?.time;
            const url = f.properties?.url || "#";
            const source = f.sourceId || "Bilinmiyor";

            // Büyüklüğe göre ana renk belirleme
            const color = mag >= 7 ? '#c0392b' : mag >= 6 ? '#e74c3c' : mag >= 5 ? '#e67e22' : mag >= 3 ? '#f1c40f' : '#2ecc71';

            // Marker elementi oluşturma
            const el = document.createElement('div');
            el.className = 'sismic-marker';
            
            // Marker boyutu ve stili
            const size = Math.max(mag * 4 + 8, 10); // Çok küçük depremlerde bile görünür kalması için alt limit
            el.style.cssText = `
                background: ${color}; 
                width: ${size}px; 
                height: ${size}px;
                border: 2px solid rgba(255,255,255,0.4);
                box-shadow: 0 0 15px ${color}88;
            `;

            // Popup içeriği (Daha önce CSS'e eklediğimiz .source-tag sınıflarını kullanır)
            const popupHTML = `
                <div style="font-family:'Inter', sans-serif; min-width:180px; padding:2px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span class="source-tag tag-${source.toLowerCase()}" style="font-size:10px; font-weight:800;">${source}</span>
                        <span style="font-size:16px; font-weight:900; color:${color}">${mag.toFixed(1)} Mw</span>
                    </div>
                    <strong style="display:block; font-size:13px; margin-bottom:6px; color:#333;">${place}</strong>
                    <div style="font-size:11px; color:#666; margin-bottom:10px; border-top:1px solid #eee; pt-5">
                        ${time ? new Date(time).toLocaleString('tr-TR') : 'Zaman Bilgisi Yok'}
                    </div>
                    <a href="${url}" target="_blank" style="display:block; text-align:center; background:#1a1a1a; color:#fff; text-decoration:none; padding:8px; border-radius:6px; font-size:11px; font-weight:bold; transition:0.3s;">
                        DETAYLARI GÖR ↗
                    </a>
                </div>
            `;

            // Haritaya ekleme
            return new mapboxgl.Marker(el)
                .setLngLat(f.geometry.coordinates)
                .setPopup(new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(popupHTML))
                .addTo(map);
        });
}

            // Popup İçeriği (CSS'teki .source-tag sınıflarını kullanır)
            const popupHTML = `
                <div style="font-family:inherit; min-width:160px; color:#000;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span class="source-tag tag-${source.toLowerCase()}">${source}</span>
                        <span style="font-size:15px; font-weight:900; color:${color}">${mag.toFixed(1)} Mw</span>
                    </div>
                    <strong style="display:block; font-size:12px; margin-bottom:5px;">${place}</strong>
                    <div style="font-size:10px; color:#666; margin-bottom:8px;">
                        ${new Date(time).toLocaleString('tr-TR')}
                    </div>
                    <a href="${url}" target="_blank" style="display:block; text-align:center; background:#333; color:#fff; text-decoration:none; padding:6px; border-radius:6px; font-size:10px; font-weight:bold;">DETAYLAR ↗</a>
                </div>
            `;

            return new mapboxgl.Marker(el)
                .setLngLat(f.geometry.coordinates)
                .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(popupHTML))
                .addTo(map);
        });
}

// 4. HARİTA KONTROLLERİ VE DİĞER FONKSİYONLAR
function rotate() {
    if (!isRotating || map.getZoom() > 5) return;
    const center = map.getCenter();
    center.lng -= 1.2;
    map.easeTo({ center, duration: 1000, easing: n => n });
}

map.on('moveend', () => { if(isRotating) rotate(); });

function toggleRotation() {
    isRotating = !isRotating;
    const btn = document.getElementById('rotation-btn');
    if(btn) btn.innerHTML = isRotating ? '🌎 Durdur' : '🔄 Döndür';
    if(isRotating) rotate();
}

function changeTime(r) { 
    currentRange = r; 
    updateBtn('.time-btn', event.target); 
    fetchData(); 
}

function changeMag(m) { 
    currentMag = m; 
    updateBtn('.mag-btn', event.target); 
    render(); 
}

function updateBtn(cls, target) { 
    document.querySelectorAll(cls).forEach(b => b.classList.remove('btn-active')); 
    if(target) target.classList.add('btn-active'); 
}

function toggleTheme() {
    const isDark = map.getStyle().name.includes('Dark');
    map.setStyle('mapbox://styles/mapbox/' + (isDark ? 'streets-v12' : 'dark-v11'));
}

function toggleLegend() { 
    const l = document.getElementById('legend');
    if(l) l.style.display = (l.style.display === 'block') ? 'none' : 'block';
}

// Başlangıç
map.on('style.load', () => { 
    map.setFog({}); 
    rotate(); 
    fetchData(); 
    // Her 2 dakikada bir veriyi otomatik tazele
    setInterval(fetchData, 120000);
});
