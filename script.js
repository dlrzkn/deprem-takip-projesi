// Mapbox panelinden aldığın aktif token
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], 
    zoom: 2.2, 
    projection: 'globe'
});

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day';

/* ==========================================================
   1. AKILLI DÜNYA DÖNÜŞ MOTORU (Eski Projedeki Mantık)
   ========================================================== */
function rotateGlobe() {
    // Eğer kullanıcı durdurduysa veya çok yakındaysa dönme
    if (!isRotating || map.getZoom() > 5) return;
    
    const center = map.getCenter();
    center.lng += 0.15; // Akıcı ve profesyonel bir dönüş hızı
    map.easeTo({ center, duration: 1000, easing: n => n });
}

// Harita her hareketini bitirdiğinde (eğer dönüş açıksa) tekrar tetikle
map.on('moveend', () => { 
    if (isRotating) rotateGlobe(); 
});

// Durdur/Döndür butonu işlevi
function toggleRotation() {
    isRotating = !isRotating;
    const btn = document.getElementById('rotation-btn');
    if (btn) {
        btn.innerHTML = isRotating ? '🌎 Durdur' : '🔄 Döndür';
    }
    if (isRotating) rotateGlobe();
}

/* ==========================================================
   2. VERİ ÇEKME VE GÖRSELLEŞTİRME
   ========================================================== */
async function fetchData() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';
    
    try {
        const res = await fetch(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${currentRange}.geojson`);
        const json = await res.json();
        allData = json.features;
        render();
        
        const updateEl = document.getElementById('last-update');
        if (updateEl) updateEl.innerText = "Son: " + new Date().toLocaleTimeString();
    } catch (e) { 
        console.error("Veri çekme hatası:", e); 
    }
    
    if (loader) loader.style.display = 'none';
}

function render() {
    markers.forEach(m => m.remove());
    markers = allData
        .filter(f => f.properties.mag >= currentMag)
        .map(f => {
            const mag = f.properties.mag;
            const props = f.properties;
            const coords = f.geometry.coordinates;
            
            // USGS ve Jeofizik Standartlarında Renk Skalası
            const color = mag >= 8 ? '#8e44ad' : mag >= 7 ? '#c0392b' : mag >= 6 ? '#e74c3c' : mag >= 5 ? '#e67e22' : mag >= 3 ? '#f1c40f' : '#2ecc71';
            
            const el = document.createElement('div');
            el.className = 'sismic-marker';
            el.style.cssText = `background:${color}; width:${mag*3+6}px; height:${mag*3+6}px;`;

            return new mapboxgl.Marker(el)
                .setLngLat([coords[0], coords[1]])
                .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`
                    <div class="pro-popup-content">
                        <div class="popup-header" style="background:${color};">
                            Mw ${mag.toFixed(1)}
                        </div>
                        <div class="popup-body">
                            <strong>${props.place}</strong>
                            <p>📏 <b>Derinlik:</b> ${coords[2] ? coords[2].toFixed(1) : '0'} km</p>
                            <p>🕒 <b>Zaman:</b> ${new Date(props.time).toLocaleString('tr-TR')}</p>
                            <a href="${props.url}" target="_blank" class="usgs-link-btn">USGS ANALİZİ ↗</a>
                        </div>
                    </div>
                `))
                .addTo(map);
        });
}

/* ==========================================================
   3. KONTROLLER VE BAŞLATICI
   ========================================================== */
function changeTime(r) { currentRange = r; updateBtn('.time-btn', event.target); fetchData(); }
function changeMag(m) { currentMag = m; updateBtn('.mag-btn', event.target); render(); }
function updateBtn(cls, target) { 
    document.querySelectorAll(cls).forEach(b => b.classList.remove('btn-active')); 
    if (target) target.classList.add('btn-active'); 
}

function toggleTheme() {
    const isDark = map.getStyle().name.includes('Dark');
    map.setStyle('mapbox://styles/mapbox/' + (isDark ? 'streets-v12' : 'dark-v11'));
}

function toggleLegend() { 
    const l = document.getElementById('legend');
    if (l) l.style.display = (l.style.display === 'block') ? 'none' : 'block';
}

// Harita ve Atmosfer hazır olduğunda başlat
map.on('style.load', () => { 
    map.setFog({}); 
    rotateGlobe(); // Otomatik dönüşü başlat
    fetchData(); 
});
