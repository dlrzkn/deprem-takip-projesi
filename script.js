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
        'star-intensity': 0.15
    });

    // --- BUTON VE DÖNÜŞ SİSTEMİ ---
    let spinEnabled = true;
    const btn = document.querySelector('.rotation-button');

    function rotateGlobe() {
        if (spinEnabled) {
            const center = map.getCenter();
            center.lng -= 0.5;
            map.easeTo({ center, duration: 1000, easing: (n) => n });
        }
    }

    // Butona tıklandığında dönüşü aç/kapat
    if (btn) {
        btn.addEventListener('click', () => {
            spinEnabled = !spinEnabled;
            btn.innerHTML = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
            btn.style.background = spinEnabled ? 'rgba(255, 165, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)';
            if (spinEnabled) rotateGlobe();
        });
    }

    // Mouse ile müdahale edildiğinde dönüşü durdur (Yakınlaşmayı sağlar)
    map.on('movestart', (e) => {
        if (e.originalEvent) {
            spinEnabled = false;
            if (btn) btn.innerHTML = 'Otomatik Dönüş: KAPALI';
        }
    });

    map.on('moveend', () => {
        rotateGlobe();
    });

    rotateGlobe();

    // --- VERİ VE GÖRSELLEŞTİRME ---
    map.addSource('quakes', {
        'type': 'geojson',
        'data': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
    });

    map.addLayer({
        'id': 'quakes-point',
        'type': 'circle',
        'source': 'quakes',
        'paint': {
            'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 3, 5, 8, 8, 20],
            'circle-color': [
                'step', ['get', 'mag'],
                '#2ecc71', 3.0, '#f1c40f', 4.0, '#e67e22', 5.0, '#e74c3c', 6.0, '#c0392b', 7.0, '#96281b', 8.0, '#8e44ad'
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-opacity': 0.8
        }
    });

    // POPUP SİSTEMİ
    map.on('click', 'quakes-point', (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const { mag, place } = e.features[0].properties;

        new mapboxgl.Popup({ offset: 10 })
            .setLngLat(coordinates)
            .setHTML(`<b>M ${mag.toFixed(1)}</b><br>${place}`)
            .addTo(map);
    });
});
