// Mapbox Erişim Tokenı
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

// Global Durum Yönetimi
let allData = [];
let markers = [];
let isRotating = true;
let currentMag = 0;
let currentRange = 'day'; // 'hour', 'day', 'week'

// Haritayı Başlat
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], 
    zoom: 2.5, 
    projection: 'globe'
});

// Atmosferik Efektler
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

    // Dinamik USGS URL'si zaman filtresine göre belirlenir
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
                const rawData = result.value.features || result.value.events || (Array.isArray(result.value) ? result.value : []);
                
                const standardized = rawData.map(f => {
                    const props = f.properties || f;
                    const eventId = props.unid || f.id || props.eventid;
                    let coords = f.geometry ? f.geometry.coordinates : [parseFloat(f.longitude), parseFloat(f.latitude)];
                    
                    // Kaynak bazlı orijinal link oluşturma
                    let customUrl = props.url;
                    if (sInfo.id === 'EMSC') customUrl = `https://www.emsc-csem.org/event/${eventId}`;
                    else if (sInfo.id === 'GFZ') customUrl = `https://geofon.gfz.de/event/gfz${eventId}`;

                    return {
                        sourceId: sInfo.id,
                        geometry: { type: 'Point', coordinates: [parseFloat(coords[0]), parseFloat(coords[1])] },
                        properties: {
                            mag: parseFloat(props.mag || props.magnitude || 0),
                            place: props.place || props.region || props.flynn_region || "Bilinmeyen Bölge",
                            time: new Date(props.time || props.m_time).getTime(),
                            url: customUrl || "#"
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
        console.error("Veri senkronizasyon hatası:", e); 
    } finally { 
        if(loader) loader.style.display = 'none'; 
    }
}

function smartDeduplicate(data) {
    const unique = [];
    const timeThreshold = 90000; // 1.5 dakika
    data.forEach(event => {
        const isDuplicate = unique.some(u => 
            Math.abs(u.properties.time - event.properties.time) < timeThreshold &&
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

    // Filtrele, Sırala ve Son 15 Kaydı Al
    const filtered = allData
        .filter(d => d.properties.mag >= currentMag)
        .sort((a, b) => b.properties.time - a.properties.time)
        .slice(0, 15);

    if (countEl) countEl.innerText = filtered.length;

    filtered.forEach(event => {
        const { mag, place, time, url } = event.properties;
        
        // Bilimsel Sınıflandırma
        let magClass = 'mag-low';
        if (mag >= 7.0) magClass = 'mag-mega'; 
        else if (mag >= 6.0) magClass = 'mag-high';
        else if (mag >= 5.0) magClass = 'mag-moderate';
        else if (mag >= 3.0) magClass = 'mag-mid';

        // 1. Marker ve Pop-up
        const el = document.createElement('div');
        el.className = `sismic-marker ${magClass}`;
        const size = Math.max(12, mag * 4.5);
        el.style.width = el.style.height = `${size}px`;

        const popup = new mapboxgl.Popup({ offset: 15, closeButton: true })
            .setHTML(`
                <div class="scientific-popup">
                    <header style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:5px">
                        <strong style="font-size:16px; color:#333">${mag.toFixed(1)} Mw</strong>
                        <span class="source-tag tag-${event.sourceId.toLowerCase()}" style="float:right">${event.sourceId}</span>
                    </header>
                    <div style="font-size:12px; color:#444">
                        <b>Bölge:</b> ${place}<br>
                        <b>Zaman:</b> ${new Date(time).toLocaleString('tr-TR')}<br>
                        <a href="${url}" target="_blank" style="display:block; margin-top:8px; color:#007bff; text-decoration:none; font-weight:bold">İstasyon Verisine Git →</a>
                    </div>
                </div>
            `);

        const marker = new mapboxgl.Marker(el)
            .setLngLat(event.geometry.coordinates)
            .setPopup(popup)
            .addTo(map);
        markers.push(marker);

        // 2. Liste Öğesi ve FlyTo Özelliği
        if (listContainer) {
            const item = document.createElement('div');
            item.className = 'list-item glass-effect';
            item.style.position = 'relative'; // Akış için
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between">
                    <b class="${magClass}">${mag.toFixed(1)}</b>
                    <small>${new Date(time).toLocaleTimeString('tr-TR')}</small>
                </div>
                <div style="font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${place}</div>
            `;
            
            item.onclick = () => {
                isRotating = false; // Odaklanınca rotasyonu durdur
                map.flyTo({
                    center: event.geometry.coordinates,
                    zoom: 7.5,
                    essential: true,
                    speed: 0.8
                });
                marker.togglePopup();
            };
            listContainer.appendChild(item);
        }
    });
}


function changeMag(m) {
    currentMag = m;
    document.querySelectorAll('.mag-btn').forEach(btn => btn.classList.toggle('btn-active', parseFloat(btn.getAttribute('onclick').match(/\d+\.?\d*/)) === m));
    render();
}

function changeTime(range) {
    currentRange = range;
    document.querySelectorAll('.time-btn').forEach(btn => btn.classList.toggle('btn-active', btn.getAttribute('onclick').includes(range)));
    fetchData(); // Zaman değişince veriyi tazelemek zorunludur
}

function toggleTheme() {
    const style = map.getStyle().mapUri;
    map.setStyle(style.includes('dark') ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11');
}

function toggleRotation() {
    isRotating = !isRotating;
    document.getElementById('rotation-btn').innerText = isRotating ? '🌎 Durdur' : '🌎 Başlat';
}

function toggleLegend() {
    const leg = document.getElementById('legend');
    leg.style.display = (leg.style.display === 'none' || leg.style.display === '') ? 'block' : 'none';
}

function updateStats() {
    const el = document.getElementById('last-update');
    if(el) el.innerText = new Date().toLocaleTimeString('tr-TR');
}

// Küre Rotasyon Döngüsü
function rotateGlobe() {
    if (isRotating && map.getZoom() < 5) {
        const center = map.getCenter();
        center.lng += 0.15;
        map.easeTo({ center, duration: 0, animate: false });
    }
    requestAnimationFrame(rotateGlobe);
}

// Uygulamayı Başlat
map.on('load', () => {
    fetchData();
    rotateGlobe();
    setInterval(fetchData, 60000); // 1 dakikada bir veri güncelleme
});






