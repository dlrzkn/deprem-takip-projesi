// Mapbox Erişim Token'ı
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

// Harita Başlatma (Globe Projeksiyonu)
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], 
    zoom: 2.2, 
    projection: 'globe'
});

// Ses Bildirimi
const alertSound = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day', isUserInteracting = false;
let lastTurkeyEventTime = 0;

// 1. JEOFİZİK SKALASI VE YARDIMCILAR
function getSismicColor(mag) {
    if (mag >= 8.0) return '#8e44ad'; // Yıkıcı
    if (mag >= 7.0) return '#c0392b'; // Büyük
    if (mag >= 6.0) return '#e74c3c'; // Güçlü
    if (mag >= 5.0) return '#e67e22'; // Orta
    if (mag >= 3.0) return '#f1c40f'; // Küçük/Hafif
    return '#2ecc71'; // Mikro
}

function toggleList() {
    const list = document.getElementById('earthquake-list');
    const container = document.getElementById('earthquake-list-container');
    if (list.style.display === "none") {
        list.style.display = "block";
        container.style.height = "45vh";
    } else {
        list.style.display = "none";
        container.style.height = "40px";
    }
}

// 2. VERİ ÇEKME VE CLUSTER GÜNCELLEME
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
        render(); // Markerları ve listeyi çiz
        updateMapSources(); // Cluster (kümeleme) katmanını güncelle
        
        // Üst Bar Bilgi Güncelleme
        const updateEl = document.getElementById('last-update');
        if(updateEl) updateEl.innerText = `${new Date().toLocaleTimeString('tr-TR')}`;
    } catch (e) { console.error("Veri Hatası:", e); }
    finally { if(loader) loader.style.display = 'none'; }
}

function smartDeduplicate(data) {
    data.sort((a, b) => a.priority - b.priority);
    const final = [];
    data.forEach(item => {
        const isDuplicate = final.some(existing => {
            const tDiff = Math.abs(item.properties.time - existing.properties.time);
            const dDiff = Math.sqrt(Math.pow(item.geometry.coordinates[0] - existing.geometry.coordinates[0], 2) + Math.pow(item.geometry.coordinates[1] - existing.geometry.coordinates[1], 2));
            return tDiff < 45000 && dDiff < 0.4;
        });
        if (!isDuplicate) final.push(item);
    });
    return final;
}

// 3. GÖRSELLEŞTİRME (MARKER VE POP-UP)
function render() {
    markers.forEach(m => m.remove());
    const filteredData = allData.filter(f => f.properties.mag >= currentMag);

    markers = filteredData.map(f => {
        const { mag, place, time, url } = f.properties;
        const color = getSismicColor(mag);
        
        const el = document.createElement('div');
        el.className = 'sismic-marker';
        const baseSize = Math.max(mag * 3.5 + 5, 8);
        el.style.cssText = `width:${baseSize}px; height:${baseSize}px; background:${color}; opacity:0.8;`;

        return new mapboxgl.Marker(el)
            .setLngLat(f.geometry.coordinates)
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <div class="pro-popup">
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding-bottom:5px; margin-bottom:8px;">
                        <span style="font-size:8px; background:#444; padding:2px 5px; border-radius:3px;">${f.sourceId}</span>
                        <b style="color:${color}">${mag.toFixed(1)} Mw</b>
                    </div>
                    <strong>${place}</strong><br>
                    <small style="color:#aaa;">${new Date(time).toLocaleString('tr-TR')}</small>
                    <a href="${url}" target="_blank" style="display:block; margin-top:10px; text-align:center; color:#ff9900; text-decoration:none; font-weight:700;">VERİ KAYNAĞI ↗</a>
                </div>
            `))
            .addTo(map);
    });
    updateList(filteredData);
}

// 4. CLUSTER (KÜMELEME) SİSTEMİ
function updateMapSources() {
    const geojson = {
        type: 'FeatureCollection',
        features: allData.map(f => ({ type: 'Feature', geometry: f.geometry, properties: f.properties }))
    };

    if (map.getSource('earthquakes')) {
        map.getSource('earthquakes').setData(geojson);
    } else {
        map.addSource('earthquakes', { type: 'geojson', data: geojson, cluster: true, clusterMaxZoom: 14, clusterRadius: 50 });

        map.addLayer({
            id: 'clusters', type: 'circle', source: 'earthquakes', filter: ['has', 'point_count'],
            paint: { 'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 10, '#f1f075', 30, '#f28cb1'], 'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 30, 25] }
        });

        map.addLayer({
            id: 'cluster-count', type: 'symbol', source: 'earthquakes', filter: ['has', 'point_count'],
            layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12, 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'] }
        });
    }
}

// 5. LİSTELEME VE ETKİLEŞİM
function updateList(data) {
    const listContainer = document.getElementById('earthquake-list');
    const countEl = document.getElementById('list-count');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    const sortedData = [...data].sort((a, b) => b.properties.time - a.properties.time);
    if (countEl) countEl.innerText = `${sortedData.length} Deprem`;

    sortedData.slice(0, 30).forEach((f, index) => {
        const { mag, place, time } = f.properties;
        const color = getSismicColor(mag);
        const isTurkey = place.toLowerCase().includes("turkey") || place.toLowerCase().includes("türkiye");

        if (index === 0 && isTurkey && mag >= 4.0 && time > lastTurkeyEventTime) {
            alertSound.play().catch(() => {});
            lastTurkeyEventTime = time;
        }

        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `<div><b style="color:${color}">${mag.toFixed(1)}</b> <small>${f.sourceId}</small></div><div>${place}${isTurkey ? " 🇹🇷" : ""}</div>`;
        item.onclick = () => map.flyTo({ center: f.geometry.coordinates, zoom: 8 });
        listContainer.appendChild(item);
    });
}

// DÖNDÜRME VE DİĞER KONTROLLER
function rotate() { if (!isRotating || map.getZoom() > 5 || isUserInteracting) return; const center = map.getCenter(); center.lng -= 1.2; map.easeTo({ center, duration: 1000, easing: n => n }); }
map.on('mousedown', () => isUserInteracting = true);
map.on('mouseup', () => { isUserInteracting = false; rotate(); });
map.on('moveend', () => { if (isRotating && !isUserInteracting) rotate(); });

function toggleRotation() { isRotating = !isRotating; document.getElementById('rotation-btn').innerText = isRotating ? '🌎' : '🔄'; if (isRotating) rotate(); }
function toggleLegend() { const l = document.getElementById('legend'); l.style.display = (l.style.display === 'none' || l.style.display === '') ? 'block' : 'none'; }
function changeTime(r) { currentRange = r; fetchData(); }
function changeMag





