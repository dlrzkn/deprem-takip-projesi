// Gerçek Jeofizik Magnitüd Skalası (Mw)
function getSismicColor(mag) {
    if (mag >= 8.0) return '#8e44ad'; // Yıkıcı
    if (mag >= 7.0) return '#c0392b'; // Büyük
    if (mag >= 6.0) return '#e74c3c'; // Güçlü
    if (mag >= 5.0) return '#e67e22'; // Orta
    if (mag >= 3.0) return '#f1c40f'; // Küçük/Hafif
    return '#2ecc71'; // Mikro
}

// Slider Gizleme/Gösterme Fonksiyonu
function toggleList() {
    const list = document.getElementById('earthquake-list');
    const container = document.getElementById('earthquake-list-container');
    if (list.style.display === "none") {
        list.style.display = "block";
        container.style.height = "45vh"; // CSS'teki eski boyuta döner
    } else {
        list.style.display = "none";
        container.style.height = "40px"; // Sadece header görünür
    }
}


function render() {
    markers.forEach(m => m.remove());
    const filteredData = allData.filter(f => f.properties.mag >= currentMag);

    markers = filteredData.map(f => {
        const { mag, place, time, url } = f.properties;
        const color = getSismicColor(mag);
        
        const el = document.createElement('div');
        el.className = 'sismic-marker';
        
        // Dinamik Boyutlandırma: Zoom seviyesi ve magnitüd etkileşimli
        const baseSize = Math.max(mag * 3.5 + 5, 8);
        el.style.width = `${baseSize}px`;
        el.style.height = `${baseSize}px`;
        el.style.backgroundColor = color;
        el.style.opacity = "0.8";

        return new mapboxgl.Marker(el)
            .setLngLat(f.geometry.coordinates)
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <div class="pro-popup">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:8px;">
                        <span class="source-tag tag-${f.sourceId.toLowerCase()}">${f.sourceId}</span>
                        <b style="color:${color}; font-size:14px;">${mag.toFixed(1)} Mw</b>
                    </div>
                    <strong style="display:block; font-size:12px; margin-bottom:5px;">${place}</strong>
                    <div style="font-size:10px; color:#666;">${new Date(time).toLocaleString('tr-TR')}</div>
                    <a href="${url}" target="_blank" style="display:block; margin-top:10px; text-align:center; background:#333; color:#fff; text-decoration:none; padding:6px; border-radius:4px; font-size:10px;">VERİ ANALİZİNE GİT ↗</a>
                </div>
            `))
            .addTo(map);
    });
    updateList(filteredData);
}






// Bu kısmı fetchData içindeki allData eşitlemesinden hemen sonraya koyabilirsin
function updateMapSources() {
    const geojson = {
        type: 'FeatureCollection',
        features: allData.map(f => ({
            type: 'Feature',
            geometry: f.geometry,
            properties: f.properties
        }))
    };

    if (map.getSource('earthquakes')) {
        map.getSource('earthquakes').setData(geojson);
    } else {
        map.addSource('earthquakes', {
            type: 'geojson',
            data: geojson,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50
        });

        // Cluster Daireleri
        map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'earthquakes',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 10, '#f1f075', 30, '#f28cb1'],
                'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 30, 25]
            }
        });

        // Cluster Sayıları
        map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'earthquakes',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-size': 12
            }
        });
    }
}







