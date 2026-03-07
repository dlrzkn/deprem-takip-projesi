// Lejant Açma/Kapatma Yönetimi
const legend = document.querySelector('.legend');
const legendOpenBtn = document.getElementById('legend-open-btn');
const legendToggle = document.getElementById('legend-toggle');

legendToggle.addEventListener('click', () => {
    legend.classList.add('closed');
    legendOpenBtn.style.display = 'block';
});

legendOpenBtn.addEventListener('click', () => {
    legend.classList.remove('closed');
    legendOpenBtn.style.display = 'none';
});

// Filtre Butonları Aktiflik Durumu
const filterButtons = document.querySelectorAll('.filter-btn');
filterButtons.forEach(btn => {
    btn.addEventListener('click', function() {
        this.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('btn-active'));
        this.classList.add('btn-active');
    });
});


mapboxgl.accessToken = 'YOUR_MAPBOX_ACCESS_TOKEN';
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11', // Koyu tema CSS ile uyumlu
    center: [35.2433, 38.9637], // Türkiye merkezli
    zoom: 5
});

// Deprem verilerini getiren asenkron fonksiyon
async function fetchEarthquakes() {
    try {
        const response = await fetch('KANDILLI_VEYA_AFAD_API_URL');
        const data = await response.json();
        updateMarkers(data);
    } catch (error) {
        console.error("Veri çekme hatası:", error);
    }
}


function applyFilters(data, minMag, timeRange) {
    return data.filter(eq => {
        const magMatch = eq.mag >= minMag;
        // Zaman filtresi mantığı buraya eklenecek
        return magMatch;
    });
}
