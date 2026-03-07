/* ==========================================================
   1. HARİTA AYARLARI (MAPBOX)
   Haritanın nerede başlayacağını ve stilini belirler.
   ========================================================== */
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtN2R2YXoybjAybG8ycXF6Mzh3dzBqZ3cifQ.x-G8m_H0o90S1u7T-7G9Yg';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11', // Koyu tema
    center: [35.2433, 38.9637], // Türkiye'nin koordinatları
    zoom: 5
});

/* ==========================================================
   2. LEJANT (BİLGİ) PANELİ KONTROLÜ
   Sağ alttaki "i" butonuna basınca panelin açılıp kapanmasını sağlar.
   ========================================================== */
function toggleLegend() {
    const panel = document.getElementById('legend-panel');
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

/* ==========================================================
   3. VERİ ÇEKME VE FİLTRELEME MANTIĞI
   Deprem verilerini alır ve butonlara basıldığında süzer.
   ========================================================== */
let allQuakes = []; // Tüm veriyi burada saklayacağız

async function getEarthquakes() {
    try {
        // Kandilli Rasathanesi verilerini çeken örnek bir API servisi
        const response = await fetch('https://api.orhanaydogdu.com.tr/deprem/kandilli/live');
        const data = await response.json();
        allQuakes = data.result;
        renderMarkers(allQuakes);
    } catch (error) {
        console.error("Veri çekilirken hata oluştu:", error);
    }
}

/* ==========================================================
   4. HARİTAYA NOKTALARI EKLEME (MARKERS)
   Depremleri büyüklüklerine göre renkli halkalar olarak çizer.
   ========================================================== */
function renderMarkers(quakes) {
    // Önce eski markerları temizle (varsa)
    const existingMarkers = document.querySelectorAll('.mapboxgl-marker');
    existingMarkers.forEach(m => m.remove());

    quakes.forEach(quake => {
        // Büyüklüğe göre renk belirle (Lejant ile uyumlu)
        let color = '#2ecc71';
        if (quake.mag >= 7.0) color = '#e74c3c';
        else if (quake.mag >= 5.0) color = '#e67e22';
        else if (quake.mag >= 3.0) color = '#f1c40f';

        // Nokta oluştur
        new mapboxgl.Marker({ color: color })
            .setLngLat([quake.geojson.coordinates[0], quake.geojson.coordinates[1]])
            .setPopup(new mapboxgl.Popup().setHTML(`
                <div style="color:#000; padding:5px;">
                    <strong>${quake.title}</strong><br>
                    Büyüklük: ${quake.mag}<br>
                    Derinlik: ${quake.depth} km<br>
                    Zaman: ${quake.date}
                </div>
            `))
            .addTo(map);
    });
}

/* ==========================================================
   5. BUTON TIKLAMALARI (FİLTRELEME)
   HTML'deki butonlara basıldığında bu fonksiyon çalışır.
   ========================================================== */
function filterMag(minMag) {
    const filtered = allQuakes.filter(q => q.mag >= minMag);
    renderMarkers(filtered);
    
    // Butonların aktiflik stilini güncelle
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.classList.remove('btn-active');
        if (parseFloat(btn.innerText) === minMag || (minMag === 0 && btn.innerText === 'Hepsi')) {
            btn.classList.add('btn-active');
        }
    });
}

// Sayfa ilk açıldığında verileri çek
getEarthquakes();
