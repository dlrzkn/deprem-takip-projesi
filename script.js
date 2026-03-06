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
                    // Profesyonel renk ve büyüklük skalası
                    'circle-radius': [
                        'interpolate', ['linear'], ['get', 'mag'],
                        1, 2,
                        3, 5,
                        5, 12,
                        7, 25
                    ],
                    'circle-color': [
                        'step', ['get', 'mag'],
                        '#00ff00', // 2.5 altı yeşil
                        2.5, '#ffff00', // 2.5-4.5 sarı
                        4.5, '#ffa500', // 4.5-6.0 turuncu
                        6.0, '#ff0000'  // 6.0 üstü kırmızı
                    ],
                    'circle-opacity': 0.7,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                }
            });

            // Tıklama özelliği (Pop-up)
            map.on('click', 'usgs-viz', (e) => {
                const props = e.features[0].properties;
                const coordinates = e.features[0].geometry.coordinates.slice();
                const date = new Date(props.time).toLocaleString('tr-TR');

                new mapboxgl.Popup()
                    .setLngLat(coordinates)
                    .setHTML(`
                        <div style="color:#333; font-family:sans-serif; padding:5px;">
                            <strong style="font-size:14px; color:#e67e22;">M ${props.mag}</strong><br>
                            <span style="font-weight:bold;">${props.place}</span><br>
                            <small>${date}</small><br>
                            <a href="${props.url}" target="_blank" style="color:#3498db; text-decoration:none; font-size:11px;">Detaylar (USGS)</a>
                        </div>
                    `)
                    .addTo(map);
            });

            // Mouse imleci değişimi
            map.on('mouseenter', 'usgs-viz', () => map.getCanvas().style.cursor = 'pointer');
            map.on('mouseleave', 'usgs-viz', () => map.getCanvas().style.cursor = '');
        }
    } catch (e) {
        console.error("Veri çekme hatası:", e);
    }
}

// Otomatik Dönüş Kontrolü
function rotateGlobe() {
    if (spinEnabled && !userInteracting && map.getZoom() < 5) {
        const center = map.getCenter();
        center.lng -= 0.05;
        map.easeTo({ center, duration: 2000, easing: (t) => t });
    }
}

const spinBtn = document.getElementById('spin-btn');
if (spinBtn) {
    spinBtn.onclick = () => {
        spinEnabled = !spinEnabled;
        spinBtn.textContent = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
        if (spinEnabled) rotateGlobe();
    };
}

map.on('mousedown', () => userInteracting = true);
map.on('mouseup', () => userInteracting = false);
map.on('moveend', rotateGlobe);

map.on('load', () => {
    updateQuakes();
    rotateGlobe();
    setInterval(updateQuakes, 60000); // 1 dakikada bir güncelle
});
