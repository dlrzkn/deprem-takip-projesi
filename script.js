/* ==========================================================
   1. HARİTA BAŞLATMA (MAPBOX)
   Haritayı oluşturur ve Türkiye üzerine odaklar.
   ========================================================== */
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtN2R2YXoybjAybG8ycXF6Mzh3dzBqZ3cifQ.x-G8m_H0o90S1u7T-7G9Yg';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11', // Profesyonel koyu tema
    center: [35.2433, 38.9637],
    zoom: 5
});

let allQuakes = []; // Tüm deprem verilerini burada tutacağız
let markers = [];    // Haritadaki noktaları yönetmek için

/* ==========================================================
   2. VERİ ÇEKME (API ENTEGRASYONU)
   Kandilli verilerini çeker ve arayüzü günceller.
   ========================================================== */
async function fetchDepremler() {
    try {
        const response = await fetch('https://api.orhanaydogdu.com.tr/deprem/kandilli/live');
        const data = await response.json();
        
        if (data.status) {
            allQuakes = data.result;
            renderMarkers(allQuakes);
            updateLastUpdateTime();
            
            // Veri gelince yükleme ekranını kapat (Süper dokunuş!)
            document.getElementById('loader').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loader').style.display = 'none';
            }, 500);
        }
    } catch (error) {
        console.error("Veri çekme hatası:", error);
        alert("Deprem verileri şu an alınamıyor, lütfen sayfayı yenileyin.");
    }
}

/* ==========================================================
   3. NOKTALARI ÇİZME VE RENKLENDİRME
   Büyüklüğe göre renk ve popup ayarlarını yapar.
   ========================================================== */
function renderMarkers(quakes) {
    // Eski markerları temizle
    markers.forEach(m => m.remove());
    markers = [];

    quakes.forEach(quake => {
        // Büyüklüğe göre renk belirle
        let color = '#2ecc71'; // < 3.0
        if (quake.mag >= 8.0) color = '#8e44ad';
        else if (quake.mag >= 7.0) color = '#e74c3c';
        else if (quake.mag >= 6.0) color = '#d35400';
        else if (quake.mag >= 5.0) color = '#e67e22';
        else if (quake.mag >= 3.0) color = '#f1c40f';

        // Yeni marker oluştur
        const marker = new mapboxgl.Marker({ color: color })
            .setLngLat([quake.geojson.coordinates[0], quake.geojson.coordinates[1]])
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <div class="popup-content">
                    <h3 style="margin:0 0 5px 0; color:#ff9900;">${quake.title}</h3>
                    <p><b>Büyüklük:</b> ${quake.mag} Mw</p>
                    <p><b>Derinlik:</b> ${quake.depth} km</p>
                    <p><b>Zaman:</b> ${quake.date}</p>
                </div>
            `))
            .addTo(map);
        
        markers.push(marker);
    });
}

/* ==========================================================
   4. ETKİLEŞİM VE FİLTRELEME
   Butonlara basıldığında veriyi süzer.
   ========================================================== */
function filterMag(minMag) {
    const filtered = allQuakes.filter(q => q.mag >= minMag);
    renderMarkers(filtered);

    // Butonların aktiflik durumunu görsel olarak değiştir
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(btn => {
        btn.classList.remove('btn-active');
        // Buton içindeki metne göre kontrol et
        if ((minMag === 0 && btn.innerText === 'Hepsi') || 
            (btn.innerText.includes(minMag.toString()) && minMag !== 0)) {
            btn.classList.add('btn-active');
        }
    });
}

function toggleLegend() {
    const panel = document.getElementById('legend-panel');
    panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ":" + 
                    now.getMinutes().toString().padStart(2, '0');
    document.getElementById('last-update').innerText = "Son Güncelleme: " + timeStr;
}

// Uygulamayı başlat
map.on('load', () => {
    fetchDepremler();
});
