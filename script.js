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
   1. AKILLI DÜNYA DÖNÜŞ MOTORU
   ========================================================== */
function rotateGlobe() {
    if (!isRotating || map.getZoom() > 5) return;
    const center = map.getCenter();
    center.lng -= 1.5;
    map.easeTo({ center, duration: 1000, easing: n => n });
}

map.on('moveend', () => { 
    if (isRotating) rotateGlobe(); 
});

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
    // Eski markerları temizle
    markers.forEach(m => m.remove());
    markers = [];

    markers = allData
        .filter(f => f.properties.mag >= currentMag)
        .map(f => {
            const mag = f.properties.mag;
            const props = f.properties;
            const coords = f.geometry.coordinates; // [boylam, enlem, derinlik]
            const depth = coords[2] || 0;
            
            // Bilimsel Renk Skalası
            const color = mag >= 8 ? '#8e44ad' : 
                          mag >= 7 ? '#c0392b' : 
                          mag >= 6 ? '#e74c3c' : 
                          mag >= 5 ? '#e67e22' : 
                          mag >= 3 ? '#f1c40f' : '#2ecc71';
            
            // Jeofiziksel Derinlik Efekti
            const blurAmount = Math.min(depth / 50, 5); 
            const glowSize = Math.max(10 - (depth / 20), 2); 
            
            const el = document.createElement('div');
            el.className = 'sismic-marker';
            
            el.style.cssText = `
                background: ${color}; 
                width: ${mag * 3 + 6}px; 
                height: ${mag * 3 + 6}px;
                filter: blur(${blurAmount * 0.2}px); 
                box-shadow: 0 0 ${glowSize}px ${color}, inset 0 0 5px rgba(255,255,255,0.5);
                opacity: ${Math.max(1 - (depth / 1000), 0.6)};
                border-radius: 50%;
                border: 1px solid white;
                cursor: pointer;
            `;

            return new mapboxgl.Marker(el)
                .setLngLat([coords[0], coords[1]])
                .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`
                    <div class="pro-popup-content">
                        <div class="popup-header" style="background:${color}; padding: 10px; color: black; font-weight: bold; text-align: center;">
                            Mw ${mag.toFixed(1)}
                        </div>
                        <div class="popup-body" style="padding: 10px; color: white;">
                            <strong style="display: block; margin-bottom: 5px; color: #ff9900;">${props.place}</strong>
                            <p style="margin: 3px 0; font-size: 12px;">📏 <b>Derinlik:</b> ${depth.toFixed(1)} km</p>
                            <p style="margin: 3px 0; font-size: 12px;">🕒 <b>Zaman:</b> ${new Date(props.time).toLocaleString('tr-TR')}</p>
                            <a href="${props.url}" target="_blank" style="display: block; margin-top: 10px; color: #ff9900; text-decoration: none; font-weight: bold; font-size: 11px;">USGS ANALİZİ ↗</a>
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

map.on('style.load', () => { 
    map.setFog({}); 
    rotateGlobe();
    fetchData(); 
});
