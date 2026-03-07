// Mapbox Erişim Tokenı
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

// Global Değişkenler
let allData = [];
let markers = [];
let isRotating = true;
let currentMag = 0;
let currentRange = 'day';

// Harita Başlatma
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], 
    zoom: 2.5, 
    projection: 'globe' // Profesyonel görünüm için küre projeksiyonu
});

// Atmosfer ve Sis Ayarları (Görsel Derinlik)
map.on('style.load', () => {
    map.setFog({
        color: 'rgb(5, 5, 5)',
        'high-color': 'rgb(20, 20, 20)',
        'horizon-blend': 0.02,
        'space-color': 'rgb(0, 0, 0)',
        'star-intensity': 0.6
    });
});



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
                // FDSNWS ve GeoJSON ayrıştırma mantığı
                const rawData = result.value.features || result.value.events || (Array.isArray(result.value) ? result.value : []);
                
                const standardized = rawData.map(f => {
                    const props = f.properties || f;
                    let coords = f.geometry ? f.geometry.coordinates : [parseFloat(f.longitude), parseFloat(f.latitude)];
                    
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
        updateStats();
    } catch (e) { 
        console.error("Sismik veri işleme hatası:", e); 
    } finally { 
        if(loader) loader.style.display = 'none'; 
    }
}

// Mükerrer Kayıtları Temizleme (Jeofiziksel Yakınlık Algoritması)
function smartDeduplicate(data) {
    const unique = [];
    const thresholdMs = 60000; // 1 dakika tolerans
    
    data.forEach(event => {
        const isDuplicate = unique.some(u => 
            Math.abs(u.properties.time - event.properties.time) < thresholdMs &&
            Math.abs(u.properties.mag - event.properties.mag) < 0.2
        );
        if (!isDuplicate) unique.push(event);
    });
    return unique;
}




function render() {
    const listContainer = document.getElementById('earthquake-list');
    const countEl = document.getElementById('list-count');
    if (listContainer) listContainer.innerHTML = '';
    
    markers.forEach(m => m.remove());
    markers = [];

    const filtered = allData
        .filter(d => d.properties.mag >= currentMag)
        .sort((a, b) => b.properties.time - a.properties.time);

    if (countEl) countEl.innerText = `${filtered.length} Aktif Kayıt`;

    filtered.forEach(event => {
        const mag = event.properties.mag;
        
        // CSS ile uyumlu bilimsel sınıf belirleme
        let magClass = 'mag-low';
        if (mag >= 6.0) magClass = 'mag-high';
        else if (mag >= 5.0) magClass = 'mag-moderate';
        else if (mag >= 3.0) magClass = 'mag-mid';

        // 1. Harita Marker İşlemleri
        const el = document.createElement('div');
        el.className = `sismic-marker ${magClass}`;
        const size = Math.max(10, mag * 4.5);
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;

        const marker = new mapboxgl.Marker(el)
            .setLngLat(event.geometry.coordinates)
            .setPopup(new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(`
                <div style="padding:5px; font-family:Inter">
                    <b style="font-size:14px">${mag.toFixed(1)} Mw</b><br>
                    <small>${event.properties.place}</small><br>
                    <hr style="margin:5px 0; opacity:0.2">
                    <span style="font-size:10px; color:#666">${new Date(event.properties.time).toLocaleString('tr-TR')}</span>
                </div>
            `))
            .addTo(map);
        markers.push(marker);

        // 2. Liste Kartı Oluşturma
        if (listContainer) {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span class="${magClass}" style="font-weight:900; font-size:16px;">${mag.toFixed(1)}</span>
                    <span class="source-tag tag-${event.sourceId.toLowerCase()}">${event.sourceId}</span>
                </div>
                <div style="font-size:11px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${event.properties.place}</div>
                <div style="font-size:9px; color:#888; margin-top:4px;">${new Date(event.properties.time).toLocaleTimeString('tr-TR')}</div>
            `;
            item.onclick = () => map.flyTo({ center: event.geometry.coordinates, zoom: 7 });
            listContainer.appendChild(item);
        }
    });
}



function updateStats() {
    const updateEl = document.getElementById('last-update');
    if(updateEl) updateEl.innerText = new Date().toLocaleTimeString('tr-TR');
}

function changeMag(m) {
    currentMag = m;
    // Buton aktiflik durumu güncelleme
    document.querySelectorAll('.mag-btn').forEach(btn => {
        btn.classList.remove('btn-active');
        if(parseFloat(btn.innerText) === m || (m === 0 && btn.innerText === 'Hepsi')) btn.classList.add('btn-active');
    });
    render();
}

function toggleRotation() {
    isRotating = !isRotating;
    const btn = document.getElementById('rotation-btn');
    if(btn) btn.innerText = isRotating ? '🌎 Durdur' : '🌎 Başlat';
}

// Otomatik Rotasyon Döngüsü
function rotateGlobe() {
    if (isRotating && map.getZoom() < 5) {
        const center = map.getCenter();
        center.lng += 0.1;
        map.easeTo({ center, duration: 0, animate: false });
    }
    requestAnimationFrame(rotateGlobe);
}

// Başlatma Komutları
map.on('load', () => {
    fetchData();
    rotateGlobe();
    setInterval(fetchData, 60000); // 1 dakikada bir otomatik güncelleme
});


