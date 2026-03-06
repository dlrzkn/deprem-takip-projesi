mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe'
});

map.addControl(new mapboxgl.NavigationControl());

map.on('load', () => {
    map.setFog({
        'range': [1, 10],
        'color': '#000000',
        'high-color': '#000000',
        'space-color': '#000000',
        'star-intensity': 0.2
    });

    // --- DÖNÜŞ SİSTEMİ ---
    let spinEnabled = false; 
    const btn = document.getElementById('spin-btn');

    function rotateGlobe() {
        if (spinEnabled) {
            const center = map.getCenter();
            center.lng -= 1.5; // Dönüş hızı
            map.easeTo({ center, duration: 1000, easing: (n) => n });
        }
    }

    if (btn) {
        btn.onclick = () => {
            spinEnabled = !spinEnabled;
            btn.innerHTML = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
            btn.style.background = spinEnabled ? 'rgba(46, 204, 113, 0.8)' : 'rgba(231, 76, 60, 0.8)';
            if (spinEnabled) rotateGlobe();
        };
    }

    // Kullanıcı haritayı elle çevirmeye başladığında otomatik dönüşü durdur
    map.on('movestart', (e) => {
        if (e.originalEvent && spinEnabled) {
            spinEnabled = false;
            if (btn) {
                btn.innerHTML = 'Otomatik Dönüş: KAPALI';
                btn.style.background = 'rgba(231, 76, 60, 0.8)';
            }
        }
    });

    map.on('moveend', () => {
        if (spinEnabled) rotateGlobe();
    });

    // --- VERİ KAYNAĞI ---
    map.addSource('quakes', {
        'type': 'geojson',
        'data': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
    });

    map.addLayer({
        'id': 'quakes-point',
        'type': 'circle',
        'source': 'quakes',
        'paint': {
            'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 3, 5, 7, 8, 18],
            'circle-color': [
                'step', ['get', 'mag'],
                '#2ecc71', 3.0, '#f1c40f', 4.0, '#e67e22', 5.0, '#e74c3c', 6.0, '#c0392b', 7.0, '#96281b', 8.0, '#8e44ad'
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-opacity': 0.8
        }
    });

    // --- DETAYLI POPUP ---
    body { margin: 0; padding: 0; background: #000; overflow: hidden; font-family: sans-serif; }
#map { position: absolute; top: 0; bottom: 0; width: 100%; }

.control-panel { position: absolute; top: 20px; left: 20px; z-index: 10; }
.btn-toggle {
    background: rgba(25, 25, 25, 0.9); color: #ff9900; border: 1px solid #444;
    padding: 10px 18px; border-radius: 8px; cursor: pointer; font-size: 12px;
    font-weight: bold; backdrop-filter: blur(8px); transition: 0.3s;
}
.btn-active { border-color: #ff9900; box-shadow: 0 0 10px rgba(255, 153, 0, 0.3); }

.legend {
    background: rgba(15, 15, 15, 0.9); color: #fff; padding: 15px;
    border-radius: 12px; position: absolute; bottom: 40px; right: 20px;
    border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px); z-index: 10;
}
.legend h4 { margin: 0 0 10px 0; color: #ff9900; font-size: 14px; }
.legend div { display: flex; align-items: center; margin-bottom: 6px; font-size: 12px; }
.legend span { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 10px; }

