mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [0, 0],
    zoom: 1.5,
    projection: 'globe'
});

let spinEnabled = true;
let userInteracting = false;

map.on('style.load', () => {
    map.setFog({
        'color': 'rgb(15, 20, 30)',
        'high-color': 'rgb(30, 60, 150)',
        'star-intensity': 0.4
    });
});

// Akıcı ve Yavaş Dönüş Mantığı
function rotateGlobe() {
    if (spinEnabled && !userInteracting && map.getZoom() < 5) {
        const center = map.getCenter();
        center.lng -= 0.1; // Çok sakin ve profesyonel bir hız
        map.easeTo({ 
            center, 
            duration: 1000, 
            easing: (t) => t,
            essential: true 
        });
    }
}

// Her hareket bittiğinde dönüşü tekrar tetikle (Sonsuz Döngü)
map.on('moveend', () => {
    rotateGlobe();
});

// Etkileşim Yönetimi
map.on('mousedown', () => { userInteracting = true; });
map.on('mouseup', () => { userInteracting = false; rotateGlobe(); });
map.on('touchstart', () => { userInteracting = true; });
map.on('touchend', () => { userInteracting = false; rotateGlobe(); });

// Veri Güncelleme
async function updateQuakes() {
    try {
        const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
        const data = await response.json();

        if (map.getSource('usgs')) {
            map.getSource('usgs').setData(data);
        } else {
            map.addSource('usgs', { type: 'geojson', data: data });
            map.addLayer({
                id: 'usgs-viz',
                type: 'circle',
                source: 'usgs',
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 2, 3, 5, 5, 12, 7, 25],
                    'circle-color': ['step', ['get', 'mag'], '#00ff00', 2.5, '#ffff00', 4.5, '#ffa500', 6.0, '#ff0000'],
                    'circle-opacity': 0.7,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                }
            });
            
            // Pop-up kurulumu
            map.on('click', 'usgs-viz', (e) => {
                const props = e.features[0].properties;
                const date = new Date(props.time).toLocaleString('tr-TR');
                new mapboxgl.Popup()
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div style="color:#333; padding:5px; font-family:sans-serif;">
                            <strong>M ${props.mag}</strong><br>
                            <b>${props.place}</b><br>
                            <small>${date}</small>
                        </div>
                    `).addTo(map);
            });
        }
    } catch (e) { console.error(e); }
}

// Başlatma
map.on('load', () => {
    updateQuakes();
    rotateGlobe(); // İlk dönüşü başlat
    setInterval(updateQuakes, 60000);
});

// Buton Kontrolü
const spinBtn = document.getElementById('spin-btn');
if (spinBtn) {
    spinBtn.onclick = () => {
        spinEnabled = !spinEnabled;
        spinBtn.textContent = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
        spinBtn.classList.toggle('btn-active');
        if (spinEnabled) rotateGlobe();
    };
}
