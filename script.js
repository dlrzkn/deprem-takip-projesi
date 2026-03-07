// Mapbox Token
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], 
    zoom: 2.2, 
    projection: 'globe'
});

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day', isUserInteracting = false;

// 1. BÖLÜM: VERİ ÇEKME VE STANDARDİZASYON
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
                    const props = f.properties ? f.properties : f;
                    const coords = f.geometry ? f.geometry.coordinates : [f.longitude, f.latitude];
                    const eventId = props.unid || f.id;
                    
                    let customUrl = props.url;
                    if (sInfo.id === 'EMSC' && eventId) customUrl = `https://www.emsc-csem.org/event/${eventId}`;
                    else if (sInfo.id === 'GFZ' && eventId) customUrl = `https://geofon.gfz.de/event/gfz${eventId}`;

                    return {
                        sourceId: sInfo.id,
                        priority: sInfo.priority,
                        geometry: { type: 'Point', coordinates: [parseFloat(coords[0]), parseFloat(coords[1])] },
                        properties: {
                            mag: parseFloat(props.mag || props.magnitude || 0),
                            // "Bilinmeyen Bölge" hatasını burası çözer:
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
        
        const stats = allData.reduce((acc, curr) => { acc[curr.sourceId] = (acc[curr.sourceId] || 0) + 1; return acc; }, {});
        const updateEl = document.getElementById('last-update');
        if(updateEl) updateEl.innerText = `E:${stats.EMSC || 0} U:${stats.USGS || 0} G:${stats.GFZ || 0} | ${new Date().toLocaleTimeString('tr-TR')}`;
    } catch (e) { console.error("Veri hatası:", e); }
    finally { if(loader) loader.style.display = 'none'; }
}

// 2. BÖLÜM: FİLTRELEME VE GÖRSELLEŞTİRME
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
        const { mag, place, time, url } = f.properties;
        const color = mag >= 7 ? '#c0392b' : mag >= 5 ? '#e67e22' : mag >= 3 ? '#f1c40f' : '#2ecc71';
        const el = document.createElement('div');
        el.className = 'sismic-marker';
        const size = Math.max(mag * 4 + 8, 12);
        el.style.cssText = `background:${color}; width:${size}px; height:${size}px; border:2px solid #fff;`;

        const marker = new mapboxgl.Marker(el)
            .setLngLat(f.geometry.coordinates)
            .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(`
                <div style="font-family:sans-serif; min-width:160px; color:#000; padding:5px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span class="source-tag tag-${f.sourceId.toLowerCase()}">${f.sourceId}</span>
                        <b style="color:${color}">${mag.toFixed(1)} Mw</b>
                    </div>
                    <strong style="display:block; font-size:12px; margin-bottom:5px;">${place}</strong>
                    <small style="color:#666;">${new Date(time).toLocaleString('tr-TR')}</small>
                    <a href="${url}" target="_blank" style="display:block; margin-top:8px; text-align:center; background:#333; color:#fff; text-decoration:none; padding:5px; border-radius:4px; font-size:10px;">DETAYLAR ↗</a>
                </div>
            `))
            .addTo(map);
        f.marker = marker;
        return marker;
    });
    updateList(filteredData);
}

// 3. BÖLÜM: ETKİLEŞİM VE YARDIMCILAR
function updateList(data) {
    const listContainer = document.getElementById('earthquake-list');
    const countEl = document.getElementById('list-count');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    const sortedData = [...data].sort((a, b) => b.properties.time - a.properties.time);
    
    // Sayaç güncellemesi:
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
            <span class="list-place" title="${place}">${place}</span>
            <small style="font-size:9px; color:#888;">${new Date(time).toLocaleTimeString('tr-TR')}</small>
        `;
        item.onclick = () => {
            map.flyTo({ center: f.geometry.coordinates, zoom: 8, duration: 1500 });
            if(f.marker) f.marker.togglePopup();
        };
        listContainer.appendChild(item);
    });
}

// AKILLI ROTASYON
map.on('mousedown', () => { isUserInteracting = true; });
map.on('touchstart', () => { isUserInteracting = true; });
map.on('mouseup', () => { isUserInteracting = false; if(isRotating) rotate(); });
map.on('touchend', () => { isUserInteracting = false; if(isRotating) rotate(); });

function rotate() {
    if (!isRotating || map.getZoom() > 5 || isUserInteracting) return;
    const center = map.getCenter();
    center.lng -= 1.2;
    map.easeTo({ center, duration: 1000, easing: n => n });
}
map.on('moveend', () => { if (isRotating && !isUserInteracting) rotate(); });

function toggleRotation() {
    isRotating = !isRotating;
    document.getElementById('rotation-btn').innerHTML = isRotating ? '🌎 Durdur' : '🔄 Döndür';
    if (isRotating) { isUserInteracting = false; rotate(); }
}

function changeTime(r) { currentRange = r; updateBtn('.time-btn', event.target); fetchData(); }
function changeMag(m) { currentMag = m; updateBtn('.mag-btn', event.target); render(); }
function updateBtn(cls, target) { document.querySelectorAll(cls).forEach(b => b.classList.remove('btn-active')); if(target) target.classList.add('btn-active'); }
function toggleTheme() { const isDark = map.getStyle().name.includes('Dark'); map.setStyle('mapbox://styles/mapbox/' + (isDark ? 'streets-v12' : 'dark-v11')); }

map.on('style.load', () => { map.setFog({}); rotate(); fetchData(); });
setInterval(fetchData, 120000);
