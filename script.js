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
    // Atmosfer Ayarları
    map.setFog({
        'range': [1, 10],
        'color': '#000000',
        'high-color': '#000000',
        'space-color': '#000000',
        'star-intensity': 0.2
    });

    // --- BUTON VE DÖNÜŞ SİSTEMİ ---
    let spinEnabled = false; // Başlangıçta kapalı
    const btn = document.getElementById('spin-btn'); // ID Eşitlendi!

    function rotateGlobe() {
        if (spinEnabled) {
            const center = map.getCenter();
            center.lng -= 1.0;
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

    // Butona tıklandığında kesin çalışır
    if (btn) {
        btn.onclick = () => {
            spinEnabled = !spinEnabled;
            btn.innerHTML = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
            btn.style.background = spinEnabled ? 'rgba(46, 204, 113, 0.8)' : 'rgba(231, 76, 60, 0.8)';
            if (spinEnabled) rotateGlobe();
        };
    }

    // Hareket bittiğinde eğer hala "AÇIK" ise dönmeye devam et
    map.on('moveend', () => {
        if (spinEnabled) rotateGlobe();
    });

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

    // --- ZENGİN POPUP İÇERİĞİ ---
    map.on('click', 'quakes-point', (e) => {
        const props = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates;
        const date = new Date(props.time).toLocaleString('tr-TR');

        new mapboxgl.Popup({ offset: 15 })
            .setLngLat(coords)
            .setHTML(`
                <div style="color:#222; font-family:sans-serif; padding:8px; line-height:1.5;">
                    <div style="font-size:1.4em; font-weight:bold; color:#e74c3c; border-bottom:2px solid #eee; margin-bottom:8px;">
                        Mw ${props.mag.toFixed(1)}
                    </div>
                    <div style="margin-bottom:5px;">📍 <b>Konum:</b> ${props.place}</div>
                    <div style="margin-bottom:5px;">📏 <b>Derinlik:</b> ${coords[2].toFixed(1)} km</div>
                    <div style="margin-bottom:5px;">🕒 <b>Zaman:</b> ${date}</div>
                    <div style="margin-bottom:5px;">💥 <b>Şiddet Tipi:</b> ${props.magType || 'Mw'}</div>
                    <div style="margin-top:10px; font-size:0.9em;">
                        <a href="${props.url}" target="_blank" style="color:#3498db; text-decoration:none;">USGS Teknik Detaylar →</a>
                    </div>
                </div>
            `)
            .addTo(map);
    });

    map.on('mouseenter', 'quakes-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'quakes-point', () => { map.getCanvas().style.cursor = ''; });
});
