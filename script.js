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
    // Atmosfer ve Sis
    map.setFog({
        'range': [1, 10],
        'color': '#000000',
        'high-color': '#000000',
        'space-color': '#000000',
        'star-intensity': 0.15
    });

    // --- BUTON VE DÖNÜŞ SİSTEMİ ---
    let spinEnabled = false; // Başlangıçta kapalı olsun ki sen yönet
    const btn = document.querySelector('.rotation-button');

    function rotateGlobe() {
        if (spinEnabled) {
            const center = map.getCenter();
            center.lng -= 1.5; // Dönüş hızı
            map.easeTo({ center, duration: 1000, easing: (n) => n });
        }
    }

    // Buton Tıklama Olayı
    if (btn) {
        btn.addEventListener('click', () => {
            spinEnabled = !spinEnabled;
            btn.innerHTML = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
            btn.style.background = spinEnabled ? 'rgba(46, 204, 113, 0.3)' : 'rgba(231, 76, 60, 0.3)';
            if (spinEnabled) rotateGlobe();
        });
    }

    map.on('moveend', () => {
        if (spinEnabled) rotateGlobe();
    });

    // --- VERİ KAYNAĞI ---
    map.addSource('quakes', {
        'type': 'geojson',
        'data': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
    });

    // Nokta Katmanı
    map.addLayer({
        'id': 'quakes-point',
        'type': 'circle',
        'source': 'quakes',
        'paint': {
            'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 3, 5, 7, 8, 15],
            'circle-color': [
                'step', ['get', 'mag'],
                '#2ecc71', 3.0, '#f1c40f', 4.0, '#e67e22', 5.0, '#e74c3c', 6.0, '#c0392b', 7.0, '#96281b', 8.0, '#8e44ad'
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-opacity': 0.8
        }
    });

    // --- DETAYLI POPUP SİSTEMİ ---
    map.on('click', 'quakes-point', (e) => {
        spinEnabled = false; // Bilgi bakarken dünya durmalı
        if (btn) btn.innerHTML = 'Otomatik Dönüş: KAPALI';

        const props = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates;
        const date = new Date(props.time).toLocaleString('tr-TR');

        new mapboxgl.Popup({ offset: 10, className: 'custom-popup' })
            .setLngLat(coords)
            .setHTML(`
                <div style="color:#222; font-family:sans-serif; min-width:180px;">
                    <h3 style="margin:0; color:#e74c3c; border-bottom:1px solid #ddd; padding-bottom:5px;">M ${props.mag.toFixed(1)}</h3>
                    <p style="margin:8px 0 4px;">📍 <b>Konum:</b> ${props.place}</p>
                    <p style="margin:4px 0;">📏 <b>Derinlik:</b> ${coords[2].toFixed(1)} km</p>
                    <p style="margin:4px 0; font-size:0.85em; color:#666;">📅 <b>Tarih:</b> ${date}</p>
                    <a href="${props.url}" target="_blank" style="display:block; margin-top:8px; color:#3498db; text-decoration:none; font-size:0.8em;">USGS Detayları →</a>
                </div>
            `)
            .addTo(map);
    });

    // Mouse imleci nokta üzerinde değişsin
    map.on('mouseenter', 'quakes-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'quakes-point', () => { map.getCanvas().style.cursor = ''; });
});
