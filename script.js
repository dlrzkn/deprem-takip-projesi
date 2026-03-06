mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe',
    interactive: true // Yakınlaşma ve uzaklaşmayı açar
});

// Sağ üst köşeye yakınlaştırma butonlarını ekleyelim
map.addControl(new mapboxgl.NavigationControl());

map.on('load', () => {
    map.setFog({
        'range': [1, 10],
        'color': '#000000',
        'high-color': '#000000',
        'space-color': '#000000',
        'star-intensity': 0.15
    });

    // --- Akıllı Dönüş Sistemi ---
    let spinEnabled = true;
    const rotationSpeed = 1.5;

    function rotateGlobe() {
        if (spinEnabled) {
            const center = map.getCenter();
            center.lng -= rotationSpeed;
            map.easeTo({ center, duration: 1000, easing: (n) => n });
        }
        requestAnimationFrame(rotateGlobe);
    }

    // Haritaya dokunduğunda veya tıkladığında dönüşü durdurur
    map.on('mousedown', () => { spinEnabled = false; });
    map.on('touchstart', () => { spinEnabled = false; });

    rotateGlobe();

    map.addSource('quakes', {
        'type': 'geojson',
        'data': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
    });

    // Isı Haritası
    map.addLayer({
        'id': 'quakes-heat',
        'type': 'heatmap',
        'source': 'quakes',
        'maxzoom': 9,
        'paint': {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 6, 1],
            'heatmap-opacity': 0.3
        }
    });

    // Nokta Katmanı (Boyutları "Kafa kadar" olmaktan çıkardık!)
    map.addLayer({
        'id': 'quakes-point',
        'type': 'circle',
        'source': 'quakes',
        'paint': {
            'circle-radius': [
                'interpolate', ['linear'], ['get', 'mag'],
                1, 2,   // M1 -> 2px
                3, 4,   // M3 -> 4px
                5, 8,   // M5 -> 8px
                7, 14,  // M7 -> 14px
                9, 22   // M9 -> 22px
            ],
            'circle-color': [
                'step', ['get', 'mag'],
                '#2ecc71', 3.0, '#f1c40f', 4.0, '#e67e22', 5.0, '#e74c3c', 6.0, '#c0392b', 7.0, '#96281b', 8.0, '#8e44ad'
            ],
            'circle-stroke-color': 'white',
            'circle-stroke-width': 1,
            'circle-opacity': 0.8
        }
    });

    // Popup - Tıklayınca hem bilgi gelir hem dünya durur
    map.on('click', 'quakes-point', (e) => {
        spinEnabled = false; 
        const coordinates = e.features[0].geometry.coordinates.slice();
        const { mag, place, time } = e.features[0].properties;

        new mapboxgl.Popup({ offset: 10 })
            .setLngLat(coordinates)
            .setHTML(`
                <div style="color:#222; padding:5px; font-family:sans-serif;">
                    <b style="font-size:1.2em; color:#e74c3c;">M ${mag.toFixed(1)}</b><br>
                    <span>${place}</span>
                </div>
            `)
            .addTo(map);
    });
});
