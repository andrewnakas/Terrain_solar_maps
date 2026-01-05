/**
 * 3D Solar Terrain Map
 * Combines MapLibre GL JS 3D terrain with comprehensive solar exposure analysis
 */

let map;
let currentExaggeration = 1;
let clickMarker = null;
let terrainCache = new Map();
let tileCache = new Map();
const tileSize = 512;
const terrainTileUrl = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';

// Sun position
let sunAzimuth = 0;
let sunAltitude = 0;
let currentDate = new Date();

// Initialize the map
map = new maplibregl.Map({
    container: 'map',
    zoom: 12,
    center: [-111.5, 36.1], // Grand Canyon
    pitch: 75,
    bearing: -30,
    maxPitch: 85,
    antialias: true,
    style: {
        version: 8,
        sources: {
            'osm': {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '&copy; OpenStreetMap contributors'
            },
            'satellite': {
                type: 'raster',
                tiles: [
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                ],
                tileSize: 256,
                attribution: '&copy; Esri, Maxar, Earthstar Geographics'
            },
            'terrarium-terrain': {
                type: 'raster-dem',
                tiles: [
                    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
                ],
                minzoom: 0,
                maxzoom: 15,
                tileSize: 256,
                encoding: 'terrarium'
            }
        },
        layers: [
            {
                id: 'satellite',
                type: 'raster',
                source: 'satellite',
                layout: {
                    visibility: 'visible'
                },
                paint: {
                    'raster-brightness-min': 0,
                    'raster-brightness-max': 1,
                    'raster-contrast': 0.4,
                    'raster-saturation': 0.3
                }
            }
        ],
        terrain: {
            source: 'terrarium-terrain',
            exaggeration: 1
        },
        light: {
            anchor: 'viewport',
            color: '#ffffff',
            intensity: 0.5,
            position: [1.5, 210, 80]
        }
    }
});

// Add navigation controls
const nav = new maplibregl.NavigationControl({
    visualizePitch: true,
    showZoom: true,
    showCompass: true
});
map.addControl(nav, 'top-right');

// Add geolocate control
map.addControl(new maplibregl.GeolocateControl({
    positionOptions: {
        enableHighAccuracy: true
    },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-right');

// Add scale
map.addControl(new maplibregl.ScaleControl({
    maxWidth: 100,
    unit: 'metric'
}));

// Add fullscreen control
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Map load handler
map.on('load', () => {
    console.log('✅ Map loaded');
    updateSunPosition();

    setTimeout(() => {
        map.easeTo({
            pitch: 80,
            bearing: -20,
            duration: 2000
        });
    }, 1000);
});

// Terrain exaggeration control
document.getElementById('exaggeration').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    currentExaggeration = value;
    document.getElementById('exag-value').textContent = value.toFixed(1) + 'x';

    map.setTerrain({
        source: 'terrarium-terrain',
        exaggeration: value
    });
});

// Pitch control
document.getElementById('pitch').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    document.getElementById('pitch-value').textContent = value + '°';
    map.setPitch(value);
});

// Location presets
function flyToGrandCanyon() {
    map.flyTo({
        center: [-111.5, 36.1],
        zoom: 12.5,
        pitch: 80,
        bearing: -30,
        duration: 3000,
        essential: true
    });
}

function flyToEverest() {
    map.flyTo({
        center: [86.925, 27.988],
        zoom: 13,
        pitch: 82,
        bearing: 135,
        duration: 3000,
        essential: true
    });
}

function flyToAlps() {
    map.flyTo({
        center: [7.658, 46.021],
        zoom: 12,
        pitch: 78,
        bearing: 90,
        duration: 3000,
        essential: true
    });
}

function flyToYosemite() {
    map.flyTo({
        center: [-119.538, 37.748],
        zoom: 12.5,
        pitch: 75,
        bearing: -45,
        duration: 3000,
        essential: true
    });
}

// Click handler for point analysis
map.on('click', async (e) => {
    const latlng = e.lngLat;
    await showPointInfo(latlng.lat, latlng.lng);
});

// Update sun position
function updateSunPosition() {
    const center = map.getCenter();
    const sunPos = SunCalc.getPosition(currentDate, center.lat, center.lng);

    const azimuth = ((sunPos.azimuth * 180 / Math.PI) + 180) % 360;
    const altitude = sunPos.altitude * 180 / Math.PI;

    sunAzimuth = azimuth;
    sunAltitude = altitude;

    const sunBadge = document.getElementById('sun-badge');
    if (altitude < 0) {
        sunBadge.textContent = '🌙 Night';
    } else if (altitude < 10) {
        sunBadge.textContent = '🌅 ' + azimuth.toFixed(0) + '°';
    } else {
        sunBadge.textContent = '☀ ' + azimuth.toFixed(0) + '° / ' + altitude.toFixed(0) + '°';
    }
}

// Show point info with solar analysis
async function showPointInfo(lat, lng) {
    document.getElementById('loading').classList.add('active');

    // Add or update marker
    if (clickMarker) {
        clickMarker.remove();
    }

    const el = document.createElement('div');
    el.className = 'click-marker';

    clickMarker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

    try {
        const zoom = Math.min(map.getZoom(), 12);
        console.log('Analyzing point:', lat, lng, 'Zoom:', zoom);

        const terrainData = await getTerrainData(lat, lng, zoom);

        if (!terrainData) {
            console.error('No terrain data available');
            document.getElementById('loading').classList.remove('active');
            alert('No terrain data available for this location. Try a different area.');
            return;
        }

        // Hide empty state, show solar data
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('solar-data').style.display = 'block';

        // Scroll to solar section smoothly
        setTimeout(() => {
            const solarSection = document.querySelector('.solar-section');
            if (solarSection) {
                solarSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);

        // Update location
        document.getElementById('location-coords').textContent =
            `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`;

        // Update terrain stats
        document.getElementById('elevation-value').textContent = Math.round(terrainData.elevation);
        document.getElementById('slope-value').textContent = terrainData.slope.toFixed(1);
        document.getElementById('aspect-value').textContent =
            `${getAspectDirection(terrainData.aspect)} (${terrainData.aspect.toFixed(0)}°) - ${getSlopeFacing(terrainData.aspect)}`;

        // Calculate current exposure
        const exposure = await calculateExposure(
            terrainData.aspect,
            terrainData.slope,
            terrainData.elevation,
            lat,
            lng
        );

        // Get sun times
        const sunTimes = SunCalc.getTimes(currentDate, lat, lng);
        const formatTime = (date) => date ? date.toTimeString().slice(0, 5) : '--:--';

        document.getElementById('sunrise-time').textContent = formatTime(sunTimes.sunrise);
        document.getElementById('sunset-time').textContent = formatTime(sunTimes.sunset);

        // Update current exposure
        document.getElementById('current-exposure').textContent = Math.round(exposure * 100);

        const inShadow = exposure === 0 && sunAltitude > 0;
        const status = sunAltitude < 0 ? '🌙 Night' :
                      inShadow ? '🌑 Shadow' :
                      exposure > 0.7 ? '☀️ Full Sun' :
                      exposure > 0.3 ? '⛅ Partial' : '🌤️ Low';
        document.getElementById('sun-status').textContent = status;

        // Calculate hourly exposure
        const hourlyData = await calculateHourlyExposure(lat, lng, terrainData);
        updateHourlyChart(hourlyData);

        const totalSunHours = hourlyData.filter(h => h.exposure > 0).length;
        document.getElementById('total-sun-hours').textContent = `${totalSunHours}h`;

    } catch (error) {
        console.error('Error:', error);
        alert('Error calculating solar data: ' + error.message);
    }

    document.getElementById('loading').classList.remove('active');
}

// Get terrain data
async function getTerrainData(lat, lng, zoom) {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;

    if (terrainCache.has(key)) {
        return terrainCache.get(key);
    }

    const elevation = await getRealElevation(lat, lng, zoom);

    if (elevation === null) {
        return null;
    }

    const { aspect, slope } = await calculateRealSlopeAspect(lat, lng, zoom);

    const data = { elevation, aspect, slope };
    terrainCache.set(key, data);

    if (terrainCache.size > 10000) {
        const firstKey = terrainCache.keys().next().value;
        terrainCache.delete(firstKey);
    }

    return data;
}

// Convert lat/lng to tile coordinates
function latLngToTile(lat, lng, zoom) {
    const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

// Load terrain tile
async function loadTerrainTile(tileX, tileY, zoom) {
    const tileKey = `${zoom}/${tileX}/${tileY}`;

    if (tileCache.has(tileKey)) {
        return tileCache.get(tileKey);
    }

    try {
        const url = terrainTileUrl
            .replace('{z}', zoom)
            .replace('{x}', tileX)
            .replace('{y}', tileY);

        const img = await loadImage(url);

        const canvas = document.createElement('canvas');
        canvas.width = tileSize;
        canvas.height = tileSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, tileSize, tileSize);

        tileCache.set(tileKey, imageData);

        if (tileCache.size > 50) {
            const firstKey = tileCache.keys().next().value;
            tileCache.delete(firstKey);
        }

        return imageData;
    } catch (error) {
        console.error('Error loading terrain tile:', error);
        return null;
    }
}

// Load image
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// Decode Terrarium RGB
function decodeTerrainRGB(r, g, b) {
    return (r * 256 + g + b / 256) - 32768;
}

// Get real elevation
async function getRealElevation(lat, lng, zoom) {
    const tile = latLngToTile(lat, lng, zoom);
    const tileData = await loadTerrainTile(tile.x, tile.y, zoom);

    if (!tileData) {
        return null;
    }

    const scale = Math.pow(2, zoom);
    const worldX = (lng + 180) / 360 * scale;
    const worldY = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * scale;

    const pixelX = Math.floor((worldX - tile.x) * tileSize);
    const pixelY = Math.floor((worldY - tile.y) * tileSize);

    if (pixelX < 0 || pixelX >= tileSize || pixelY < 0 || pixelY >= tileSize) {
        return null;
    }

    const idx = (pixelY * tileSize + pixelX) * 4;
    const r = tileData.data[idx];
    const g = tileData.data[idx + 1];
    const b = tileData.data[idx + 2];

    if (r === 0 && g === 0 && b === 0) {
        return null;
    }

    return decodeTerrainRGB(r, g, b);
}

// Calculate slope and aspect
async function calculateRealSlopeAspect(lat, lng, zoom) {
    const delta = 0.0001;

    const elevCenter = await getRealElevation(lat, lng, zoom);
    const elevNorth = await getRealElevation(lat + delta, lng, zoom);
    const elevSouth = await getRealElevation(lat - delta, lng, zoom);
    const elevEast = await getRealElevation(lat, lng + delta, zoom);
    const elevWest = await getRealElevation(lat, lng - delta, zoom);

    if (elevCenter === null || elevNorth === null || elevSouth === null ||
        elevEast === null || elevWest === null) {
        return { aspect: 0, slope: 0 };
    }

    const metersPerDegree = 111320 * Math.cos(lat * Math.PI / 180);
    const dzdx = (elevEast - elevWest) / (2 * delta * metersPerDegree);
    const dzdy = (elevSouth - elevNorth) / (2 * delta * 111320);

    const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
    const slope = slopeRad * 180 / Math.PI;

    let mathAspect = Math.atan2(dzdy, -dzdx) * 180 / Math.PI;
    let aspect = 90 - mathAspect;

    if (aspect < 0) aspect += 360;
    if (aspect >= 360) aspect -= 360;

    return { aspect, slope };
}

// Calculate exposure
async function calculateExposure(aspect, slope, elevation, lat, lng) {
    if (sunAltitude < 0) {
        return 0;
    }

    const slopeRad = slope * Math.PI / 180;
    const aspectRad = aspect * Math.PI / 180;
    const sunAltRad = sunAltitude * Math.PI / 180;
    const sunAzRad = sunAzimuth * Math.PI / 180;

    const slopeNx = Math.sin(slopeRad) * Math.sin(aspectRad);
    const slopeNy = Math.sin(slopeRad) * Math.cos(aspectRad);
    const slopeNz = Math.cos(slopeRad);

    const sunDx = Math.cos(sunAltRad) * Math.sin(sunAzRad);
    const sunDy = Math.cos(sunAltRad) * Math.cos(sunAzRad);
    const sunDz = Math.sin(sunAltRad);

    let exposure = slopeNx * sunDx + slopeNy * sunDy + slopeNz * sunDz;
    exposure = Math.max(0, Math.min(1, exposure));

    // Apply shadow check (simplified for performance)
    if (exposure > 0) {
        const shadowFactor = await calculateShadow(lat, lng, elevation);
        exposure *= shadowFactor;
    }

    return exposure;
}

// Calculate shadow
async function calculateShadow(lat, lng, elevation) {
    if (sunAltitude < 0) {
        return 0;
    }

    const maxDistance = 5000;
    const stepSize = 100;
    const zoom = Math.min(map.getZoom(), 12);

    const sunAzRad = sunAzimuth * Math.PI / 180;
    const sunAltRad = sunAltitude * Math.PI / 180;

    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(lat * Math.PI / 180);

    const latStep = (Math.cos(sunAzRad) * stepSize) / metersPerDegreeLat;
    const lngStep = (Math.sin(sunAzRad) * stepSize) / metersPerDegreeLng;

    let currentLat = lat;
    let currentLng = lng;
    let distance = 0;

    while (distance < maxDistance) {
        distance += stepSize;
        currentLat += latStep;
        currentLng += lngStep;

        const rayHeight = elevation + distance * Math.tan(sunAltRad);
        const terrainHeight = await getRealElevation(currentLat, currentLng, zoom);

        if (terrainHeight === null) break;
        if (terrainHeight > rayHeight) return 0;
        if (rayHeight - terrainHeight > 500) break;
    }

    return 1;
}

// Calculate hourly exposure
async function calculateHourlyExposure(lat, lng, terrainData) {
    const hourlyData = [];
    const date = currentDate;
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    for (let hour = 0; hour < 24; hour++) {
        const testTime = new Date(startOfDay);
        testTime.setHours(hour);

        const sunPos = SunCalc.getPosition(testTime, lat, lng);
        const altitude = sunPos.altitude * 180 / Math.PI;
        const azimuth = ((sunPos.azimuth * 180 / Math.PI) + 180) % 360;

        let exposure = 0;

        if (altitude > 0) {
            const oldAlt = sunAltitude;
            const oldAz = sunAzimuth;
            sunAltitude = altitude;
            sunAzimuth = azimuth;

            exposure = await calculateExposure(
                terrainData.aspect,
                terrainData.slope,
                terrainData.elevation,
                lat,
                lng
            );

            sunAltitude = oldAlt;
            sunAzimuth = oldAz;
        }

        hourlyData.push({
            hour,
            exposure,
            altitude,
            azimuth
        });
    }

    return hourlyData;
}

// Update hourly chart
function updateHourlyChart(hourlyData) {
    const chartBars = document.getElementById('exposure-bars');
    chartBars.innerHTML = '';

    const currentHour = currentDate.getHours();

    hourlyData.forEach(data => {
        const bar = document.createElement('div');
        bar.className = 'chart-bar';

        const height = data.exposure * 100;
        bar.style.height = `${height}%`;

        if (data.exposure > 0) {
            bar.classList.add('exposed');
        } else if (data.altitude > 0) {
            bar.classList.add('shadow');
        }

        if (data.hour === currentHour) {
            bar.classList.add('current');
        }

        chartBars.appendChild(bar);
    });
}

// Get aspect direction
function getAspectDirection(aspect) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(aspect / 45) % 8;
    return directions[index];
}

// Get slope facing
function getSlopeFacing(aspect) {
    if (aspect >= 315 || aspect < 45) {
        return '❄️ North facing';
    } else if (aspect >= 45 && aspect < 135) {
        return '🌅 East facing';
    } else if (aspect >= 135 && aspect < 225) {
        return '☀️ South facing';
    } else {
        return '🌇 West facing';
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    map.resize();
});

console.log('🏔️ 3D Solar Terrain Map Initialized');
console.log('Click anywhere on the map to analyze sun exposure!');
