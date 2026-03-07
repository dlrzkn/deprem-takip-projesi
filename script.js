// Mapbox Erişim Tokenı
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day';

// Haritayı Küre Projeksiyonu ile Başlat
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], zoom: 2.2, projection: 'globe'
});

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
                const rawData = result.value.features || result.value.events || (Array.isArray(result.value) ? result.value : []);
                
                const standardized = rawData.map(f => {
                    const props = f.properties || f;
                    const coords = f.geometry ? f.geometry.coordinates : [parseFloat(f.longitude), parseFloat(f.latitude)];
                    const eventId = props.unid || f.id || props.eventid;
                    
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
        document.getElementById('last-update').innerText = new Date().toLocaleTimeString('tr-TR');
    } catch (e) { console.error("Veri hatası:", e); }
    finally { if(loader) loader.style.display = 'none'; }
}

function smartDeduplicate(data) {
    const unique = [];
    data.forEach(event => {
        const isDuplicate = unique.some(u => 
            Math.abs(u.properties.time - event.properties.time) < 90000 &&
            Math.abs(u.properties.mag - event.properties.mag) < 0.2
        );
        if (!isDuplicate) unique.push(event);
    });
    return unique;
}



function render() {
    const listContainer = document.getElementById('earthquake-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    markers.forEach(m => m.remove());
    markers = [];

    const filtered = allData
        .filter(d => d.properties.mag >= currentMag)
        .sort((a, b) => b.properties.time - a.properties.time)
        .slice(0, 15); // Sadece son 15 deprem

    document.getElementById('list-count').innerText = filtered.length;

    filtered.forEach(event => {
        const { mag, place, time, url } = event.properties;
        
        let magClass = 'mag-low';
        if (mag >= 7.0) magClass = 'mag-mega';
        else if (mag >= 6.0) magClass = 'mag-high';
        else if (mag >= 5.0) magClass = 'mag-moderate';
        else if (mag >= 3.0) magClass = 'mag-mid';

        // 1. Marker ve Gelişmiş Pop-up
        const el = document.createElement('div');
        el.className = `sismic-marker ${magClass}`;
        el.style.width = el.style.height = `${Math.max(10, mag * 4.2)}px`;

        const marker = new mapboxgl.Marker(el)
            .setLngLat(event.geometry.coordinates)
            .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`
                <div style="color:#1a1a1a; font-family:sans-serif; min-width:150px">
                    <strong style="font-size:16px">${mag.toFixed(1)} Mw</strong>
                    <span style="float:right; font-size:10px; background:#eee; padding:2px 5px; border-radius:4px">${event.sourceId}</span>
                    <div style="margin:8px 0; font-size:12px; line-height:1.4">${place}</div>
                    <div style="font-size:10px; color:#666">${new Date(time).toLocaleString('tr-TR')}</div>
                    <a href="${url}" target="_blank" style="display:block; margin-top:10px; color:#007bff; text-decoration:none; font-weight:bold; font-size:11px">İSTASYON VERİSİNE GİT →</a>
                </div>
            `))
            .addTo(map);
        markers.push(marker);

        // 2. Liste Öğesi ve FlyTo Etkileşimi
        const item = document.createElement('div');
        item.className = 'list-item'; 
        item.style.cssText = "padding:12px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05); transition:0.2s";
        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center">
                <b class="${magClass}" style="font-size:15px">${mag.toFixed(1)}</b>
                <small style="font-size:10px; color:#888">${new Date(time).toLocaleTimeString('tr-TR')}</small>
            </div>
            <div style="font-size:11px; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#ddd">${place}</div>
        `;
        
        item.onclick = () => {
            isRotating = false;
            map.flyTo({ center: event.geometry.coordinates, zoom: 7.5, speed: 1.2, essential: true });
            marker.togglePopup();
        };
        listContainer.appendChild(item);
    });
}

// Kontrol Fonksiyonları
function changeMag(m) { 
    currentMag = m; 
    document.querySelectorAll('.mag-btn').forEach(b => b.classList.toggle('btn-active', parseFloat(b.innerText) == m || (m == 0 && b.innerText == 'Hepsi')));
    render(); 
}
function changeTime(range) { currentRange = range; fetchData(); }
function toggleRotation() { isRotating = !isRotating; document.getElementById('rotation-btn').innerText = isRotating ? '🌎 Durdur' : '🌎 Başlat'; }
function toggleTheme() { 
    const s = map.getStyle().mapUri; 
    map.setStyle(s.includes('dark') ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11'); 
}
function toggleLegend() { 
    const l = document.getElementById('legend'); 
    l.style.display = (l.style.display === 'none' || l.style.display === '') ? 'block' : 'none'; 
}

// Döngü ve Başlatma
function rotateGlobe() { if (isRotating && map.getZoom() < 5) { const c = map.getCenter(); c.lng += 0.15; map.easeTo({ center: c, duration: 0, animate: false }); } requestAnimationFrame(rotateGlobe); }

map.on('load', () => { fetchData(); rotateGlobe(); setInterval(fetchData, 60000); });



