// Mapbox Token
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], 
    zoom: 2.2, 
    projection: 'globe'
});

// Ses Bildirimi (Türkiye'de 4.0+ deprem olduğunda çalar)
const alertSound = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day', isUserInteracting = false;
let lastTurkeyEventTime = 0; // Tekrar eden sesleri önlemek için

// 1. BÖLÜM: VERİ ÇEKME
async function fetchData() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    const sources = [
        { id: 'EMSC', url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=150', priority: 0 },
        { id: 'USGS', url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${currentRange}.geojson`, priority: 1 },
        { id: 'GFZ', url: 'https://geofon.gfz.de/fdsnws/event/1/query?format=json&limit=50', priority: 2 }
    ];

    try {
        const results = await Promise.allSettled(sources.map(s => fetch(s.url).then(r => r.json())));
        let mergedFeatures = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const sInfo = sources[index];
                const rawData = result.value.features || (Array.isArray(result.value) ? result.value : []);
                
                const standardized = rawData.map(f => {
                    const props = f.properties || f;
                    const coords = f.geometry ? f.geometry.coordinates : [f.longitude, f.latitude];
                    return {
                        sourceId: sInfo.id,
                        priority: sInfo.priority,
                        geometry: { type: 'Point', coordinates: [parseFloat(coords[0]), parseFloat(coords[1])] },
                        properties: {
                            mag: parseFloat(props.mag || props.magnitude || 0),
                            place: props.place || props.region || props.flynn_region || "Bilinmeyen Bölge",
                            time: new Date(props.time || props.m_time).getTime(),
                            url: props.url || "#"
                        }
                    };
                });
                mergedFeatures = [...mergedFeatures, ...standardized];
            }
        });

        allData = smartDeduplicate(mergedFeatures);
        render();
        
        // İstatistik Güncelleme
        const stats = allData.reduce((acc, curr) => { acc[curr.sourceId] = (acc[curr.sourceId] || 0) + 1; return acc; }, {});
        const updateEl = document.getElementById('last-update');
        if(updateEl) updateEl.innerText = `E:${stats.EMSC || 0} U:${stats.USGS || 0} G:${stats.GFZ || 0} | ${new Date().toLocaleTimeString('tr-TR')}`;
    } catch (e) { console.error("Veri hatası:", e); }
    finally { if(loader) loader.style.display = 'none'; }
}

// 2. BÖLÜM: TEMİZLEME VE GÖRSELLEŞTİRME
function smartDeduplicate(data) {
    data.sort((a, b) => a.priority - b.priority);
    const final = [];
    data.forEach(item => {
        const isDuplicate = final.some(existing => {
            const tDiff = Math.abs(item.properties.time - existing.properties.time);
            const dDiff = Math.sqrt(
                Math.pow(item.geometry.coordinates[0] - existing.geometry.coordinates[0], 2) +
                Math.pow(item.geometry.coordinates[1] - existing.geometry.coordinates[1], 2)
            );
            return tDiff < 45000 && dDiff < 0.4;
        });
        if (!isDuplicate) final.push(item);
    });
    return final;
}

function render() {
    markers.forEach(m => m.remove());
    const filteredData = allData.filter(f => f.properties.mag >= currentMag);

    markers = filteredData.map(f => {
        const { mag, place, time } = f.properties;
        const color = mag >= 7 ? '#c0392b' : mag >= 5 ? '#e67e22' : mag >= 3 ? '#f1c40f' : '#2ecc71';
        const el = document.createElement('div');
        el.className = 'sismic-marker';
        const size = Math.max(mag * 4 + 8, 12);
        el.style.cssText = `background:${color}; width:${size}px; height:${size}px; border:2px solid #fff;`;

        return new mapboxgl.Marker(el)
            .setLngLat(f.geometry.coordinates)
            .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(`
                <div style="color:#000; font-size:11px; padding:5px;">
                    <b style="color:${color}">${mag.toFixed(1)} Mw</b><br>
                    <strong>${place}</strong><br>
                    <small>${new Date(time).toLocaleString('tr-TR')}</small>
                </div>
            `))
            .addTo(map);
    });
    updateList(filteredData);
}

// 3. BÖLÜM: LİSTELEME VE SESLİ UYARI
function updateList(data) {
    const listContainer = document.getElementById('earthquake-list');
    const countEl = document.getElementById('list-count');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    const sortedData = [...data].sort((a, b) => b.properties.time - a.properties.time);
    if (countEl) countEl.innerText = `${sortedData.length} Deprem`;

    sortedData.slice(0, 30).forEach((f, index) => {
        const { mag, place, time } = f.properties;
        const isTurkey = place.toLowerCase().includes("turkey") || place.toLowerCase().includes("türkiye");
        const color = mag >= 7 ? '#c0392b' : mag >= 5 ? '#e67e22' : mag >= 3 ? '#f1c40f' : '#2ecc71';

        // Sesli Uyarı: Türkiye'de yeni ve 4.0+ bir deprem varsa
        if (index === 0 && isTurkey && mag >= 4.0 && time > lastTurkeyEventTime) {
            alertSound.play().catch(() => console.log("Ses izni bekleniyor..."));
            lastTurkeyEventTime = time;
        }

        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="list-item-top">
                <b style="color:${color}; font-size:13px;">${mag.toFixed(1)}</b>
                <small style="font-size:8px; opacity:0.7;">${f.sourceId}</small>
            </div>
            <div style="font-size:10px; margin:2px 0;">${place}${isTurkey ? " 🇹🇷" : ""}</div>
            <small style="font-size:8px; color:#888;">${new Date(time).toLocaleTimeString('tr-TR')}</small>
        `;
        item.onclick = () => map.flyTo({ center: f.geometry.coordinates, zoom: 8 });
        listContainer.appendChild(item);
    });
}

// 4. BÖLÜM: YARDIMCILAR VE ETKİLEŞİM
function rotate() {
    if (!isRotating || map.getZoom() > 5 || isUserInteracting) return;
    const center = map.getCenter();
    center.lng -= 1.2;
    map.easeTo({ center, duration: 1000, easing: n => n });
}

map.on('mousedown', () => isUserInteracting = true);
map.on('mouseup', () => { isUserInteracting = false; rotate(); });
map.on('moveend', () => { if (isRotating && !isUserInteracting) rotate(); });

function toggleRotation() {
    isRotating = !isRotating;
    document.getElementById('rotation-btn').innerText = isRotating ? '🌎 Durdur' : '🔄 Döndür';
    if (isRotating) rotate();
}

function toggleLegend() {
    const l = document.getElementById('legend');
    if (l) l.style.display = (l.style.display === 'none' || l.style.display === '') ? 'block' : 'none';
}

function changeTime(r) { 
    currentRange = r; 
    // Buton aktiflik sınıflarını güncelle
    document.querySelectorAll('.time-btn').forEach(b => b.classList.toggle('btn-active', b.innerText.includes(r === 'hour' ? '1' : r === 'day' ? '24' : '7')));
    fetchData(); 
}

function changeMag(m) { 
    currentMag = m; 
    document.querySelectorAll('.mag-btn').forEach(b => b.classList.toggle('btn-active', b.innerText.includes(m === 0 ? 'Hepsi' : m.toString())));
    render(); 
}

function toggleTheme() { 
    const isDark = map.getStyle().name.includes('Dark'); 
    map.setStyle('mapbox://styles/mapbox/' + (isDark ? 'streets-v12' : 'dark-v11')); 
}

map.on('style.load', () => { map.setFog({}); rotate(); fetchData(); });
setInterval(fetchData, 120000);
