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

            // 1. Parlama Efekti (Pulse/Glow)
            map.addLayer({
                id: 'usgs-pulse',
                type: 'circle',
                source: 'usgs',
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 4, 15, 7, 40, 10, 100],
                    'circle-color': '#ff0000',
                    'circle-opacity': 0.15,
                    'circle-blur': 1.5
                }
            });

            // 2. Ana Deprem Katmanı (0-10 Ölçekli)
            map.addLayer({
                id: 'usgs-viz',
                type: 'circle',
                source: 'usgs',
                paint: {
                    'circle-radius': [
                        'interpolate', ['linear'], ['get', 'mag'],
                        0, 1.5, 2.5, 3, 4.5, 7, 6.0, 15, 8.0, 30, 10, 50
                    ],
                    'circle-color': [
                        'step', ['get', 'mag'],
                        '#2ecc71', 2.5, '#f1c40f', 4.5, '#e67e22', 6.0, '#e74c3c', 8.0, '#8e44ad'
                    ],
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                }
            });

            // Pop-up Mantığı
            map.on('click', 'usgs-viz', (e) => {
                const props = e.features[0].properties;
                const date = new Date(props.time).toLocaleString('tr-TR');
                new mapboxgl.Popup()
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div style="color:#333; padding:5px; font-family:sans-serif;">
                            <strong style="font-size:14px;">M ${props.mag}</strong><br>
                            <b>${props.place}</b><br>
                            <small>${date}</small>
                        </div>
                    `).addTo(map);
            });
            map.on('mouseenter', 'usgs-viz', () => map.getCanvas().style.cursor = 'pointer');
            map.on('mouseleave', 'usgs-viz', () => map.getCanvas().style.cursor = '');
        }
    } catch (e) { console.error(e); }
}

function rotateGlobe() {
    if (spinEnabled && !userInteracting && map.getZoom() < 5) {
        const center = map.getCenter();
        center.lng -= 0.5;
        map.easeTo({ center, duration: 1000, easing: (t) => t, essential: true });
    }
}

map.on('moveend', rotateGlobe);
map.on('mousedown', () => userInteracting = true);
map.on('mouseup', () => { userInteracting = false; rotateGlobe(); });
map.on('load', () => { updateQuakes(); rotateGlobe(); setInterval(updateQuakes, 60000); });

const spinBtn = document.getElementById('spin-btn');
if (spinBtn) {
    spinBtn.onclick = () => {
        spinEnabled = !spinEnabled;
        spinBtn.textContent = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
        spinBtn.classList.toggle('btn-active');
        if (spinEnabled) rotateGlobe();
    };
}
