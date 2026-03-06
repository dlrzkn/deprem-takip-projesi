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
    map.on('click', 'quakes-point', (e) => {
        const props = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates;
        const date = new Date(props.time).toLocaleString('tr-TR');

        new mapboxgl.Popup({ offset: 15 })
            .setLngLat(coords)
            .setHTML(`
                <div style="color:#222; font-family:sans-serif; padding:5px; min-width:200px;">
                    <h3 style="margin:0; color:#e74c3c; border-bottom:1px solid #ddd;">Mw ${props.mag.toFixed(1)}</h3>
                    <p style="margin:8px 0;">📍 <b>Konum:</b> ${props.place}</p>
                    <p style="margin:4px 0;">📏 <b>Derinlik:</b> ${coords[2].toFixed(1)} km</p>
                    <p style="margin:4px 0;">🕒 <b>Zaman:</b> ${date}</p>
                    <a href="${props.url}" target="_blank" style="display:block; margin-top:10px; color:#3498db; text-decoration:none;">Teknik Detaylar (USGS) →</a>
                </div>
            `)
            .addTo(map);
    });

    map.on('mouseenter', 'quakes-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'quakes-point', () => { map.getCanvas().style.cursor = ''; });
});
