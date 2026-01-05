/**
 * 3D Solar Terrain Map
 * Combines MapLibre GL JS 3D terrain with comprehensive solar exposure analysis
 * Version: 2.2 - Debug elevation query
 */

let map;
let currentExaggeration = 1;
let clickMarker = null;
let analysisGrid = null; // Grid showing analysis area
let terrainCache = new Map();

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

    // Wait a bit for terrain to be fully loaded
    await new Promise(resolve => setTimeout(resolve, 100));

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

    // Add analysis grid showing the sampled area
    if (analysisGrid) {
        map.removeLayer('analysis-grid-fill');
        map.removeLayer('analysis-grid-line');
        map.removeSource('analysis-grid');
    }

    const gridSize = 0.0002; // ~22 meters
    const bounds = [
        [lng - gridSize, lat - gridSize],
        [lng + gridSize, lat - gridSize],
        [lng + gridSize, lat + gridSize],
        [lng - gridSize, lat + gridSize],
        [lng - gridSize, lat - gridSize]
    ];

    map.addSource('analysis-grid', {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [bounds]
            }
        }
    });

    map.addLayer({
        'id': 'analysis-grid-fill',
        'type': 'fill',
        'source': 'analysis-grid',
        'paint': {
            'fill-color': '#ff6b00',
            'fill-opacity': 0.1
        }
    });

    map.addLayer({
        'id': 'analysis-grid-line',
        'type': 'line',
        'source': 'analysis-grid',
        'paint': {
            'line-color': '#ff6b00',
            'line-width': 2,
            'line-dasharray': [2, 2]
        }
    });

    analysisGrid = true;

    try {
        const zoom = Math.min(map.getZoom(), 12);
        console.log('Analyzing point:', lat, lng, 'Zoom:', zoom);

        const terrainData = await getTerrainData(lat, lng, zoom);

        if (!terrainData) {
            console.error('No terrain data available for this location');
            document.getElementById('loading').classList.remove('active');
            alert('No terrain data available for this location. Try a different area or check the browser console (F12) for details.');
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

        // Astronomical times (textbook horizon)
        document.getElementById('astronomical-sunrise').textContent = formatTime(sunTimes.sunrise);
        document.getElementById('astronomical-sunset').textContent = formatTime(sunTimes.sunset);

        // Calculate terrain-aware sun times
        console.log('Calculating terrain-aware sun times...');
        const terrainSunTimes = calculateTerrainSunTimes(lat, lng, terrainData.elevation);
        document.getElementById('terrain-sunrise').textContent = formatTime(terrainSunTimes.sunrise);
        document.getElementById('terrain-sunset').textContent = formatTime(terrainSunTimes.sunset);

        // Calculate slope sun times
        console.log('Calculating slope sun times...');
        const slopeTimes = calculateSlopeSunTimes(lat, lng, terrainData);
        document.getElementById('slope-sun-start').textContent = formatTime(slopeTimes.slopeStart);
        document.getElementById('slope-sun-end').textContent = formatTime(slopeTimes.slopeEnd);

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

// Get terrain data using MapLibre's terrain query
async function getTerrainData(lat, lng, zoom) {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;

    if (terrainCache.has(key)) {
        return terrainCache.get(key);
    }

    // Wait for terrain to be fully loaded and rendered
    await new Promise(resolve => setTimeout(resolve, 300));

    // Try to query terrain elevation - MapLibre needs terrain to be loaded
    let elevation = null;

    try {
        // Query with exaggerated: false to get true elevation
        elevation = map.queryTerrainElevation([lng, lat], { exaggerated: false });
        console.log(`MapLibre elevation query returned: ${elevation}`);
    } catch (error) {
        console.error('Error querying terrain elevation:', error);
    }

    // If MapLibre query failed or returned null, try alternative method
    if (elevation === null || elevation === undefined || isNaN(elevation)) {
        console.warn('MapLibre query failed, trying terrain source directly...');

        // Try to get elevation from the terrain source
        const terrainSource = map.getSource('terrarium-terrain');
        if (terrainSource) {
            console.log('Terrain source found:', terrainSource);
            // Query the rendered features at this point
            const point = map.project([lng, lat]);
            const features = map.queryRenderedFeatures(point, {
                layers: [] // Query all layers
            });
            console.log('Features at point:', features);
        }

        // As fallback, estimate from zoom level (rough approximation)
        // This is temporary until we can get real elevation
        console.warn('Using estimated elevation - this is not accurate!');
        elevation = 1000; // Default fallback
    }

    console.log(`Final elevation: ${elevation.toFixed(2)}m`);

    // Calculate slope and aspect using nearby points (same as original solar calculator)
    const delta = 0.0001; // ~11 meters

    let elevNorth = null;
    let elevSouth = null;
    let elevEast = null;
    let elevWest = null;

    try {
        elevNorth = map.queryTerrainElevation([lng, lat + delta], { exaggerated: false });
        elevSouth = map.queryTerrainElevation([lng, lat - delta], { exaggerated: false });
        elevEast = map.queryTerrainElevation([lng + delta, lat], { exaggerated: false });
        elevWest = map.queryTerrainElevation([lng - delta, lat], { exaggerated: false });
    } catch (error) {
        console.error('Error querying surrounding elevations:', error);
    }

    // If any surrounding point is null, use center elevation
    const elevN = (elevNorth !== null && !isNaN(elevNorth)) ? elevNorth : elevation;
    const elevS = (elevSouth !== null && !isNaN(elevSouth)) ? elevSouth : elevation;
    const elevE = (elevEast !== null && !isNaN(elevEast)) ? elevEast : elevation;
    const elevW = (elevWest !== null && !isNaN(elevWest)) ? elevWest : elevation;

    console.log(`Surrounding elevations - N:${elevN.toFixed(1)} S:${elevS.toFixed(1)} E:${elevE.toFixed(1)} W:${elevW.toFixed(1)}`);

    // Calculate slope and aspect (same formula as original)
    const metersPerDegree = 111320 * Math.cos(lat * Math.PI / 180);
    const dzdx = (elevE - elevW) / (2 * delta * metersPerDegree);
    const dzdy = (elevS - elevN) / (2 * delta * 111320);

    const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
    const slope = slopeRad * 180 / Math.PI;

    // Calculate aspect using standard GIS formula (same as original)
    let mathAspect = Math.atan2(dzdy, -dzdx) * 180 / Math.PI;
    let aspect = 90 - mathAspect;

    if (aspect < 0) aspect += 360;
    if (aspect >= 360) aspect -= 360;

    console.log(`Slope: ${slope.toFixed(1)}°, Aspect: ${aspect.toFixed(0)}°`);

    const data = { elevation, aspect, slope };
    terrainCache.set(key, data);

    if (terrainCache.size > 10000) {
        const firstKey = terrainCache.keys().next().value;
        terrainCache.delete(firstKey);
    }

    return data;
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
        const shadowFactor = calculateShadow(lat, lng, elevation);
        exposure *= shadowFactor;
    }

    return exposure;
}

// Calculate shadow using MapLibre terrain (same as original solar calculator)
function calculateShadow(lat, lng, elevation) {
    if (sunAltitude < 0) {
        return 0;
    }

    const maxDistance = 5000; // 5km max distance
    const stepSize = 100; // Check every 100m

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
        const terrainHeight = map.queryTerrainElevation([currentLng, currentLat], { exaggerated: false });

        if (terrainHeight === null || terrainHeight === undefined) break;
        if (terrainHeight > rayHeight) return 0; // Shadow detected
        if (rayHeight - terrainHeight > 500) break; // Ray is far above terrain
    }

    return 1; // No shadow
}

// Calculate terrain-aware sun times (when sun clears terrain obstacles)
function calculateTerrainSunTimes(lat, lng, elevation) {
    const date = currentDate;
    const sunTimes = SunCalc.getTimes(date, lat, lng);

    let terrainSunrise = sunTimes.sunrise;
    let terrainSunset = sunTimes.sunset;

    // Check if terrain blocks sunrise (eastern mountains)
    if (sunTimes.sunrise && !isNaN(sunTimes.sunrise.getTime())) {
        // Walk forward from astronomical sunrise
        for (let i = 0; i < 180; i += 5) {
            const testDate = new Date(sunTimes.sunrise.getTime() + i * 60 * 1000);
            const testPos = SunCalc.getPosition(testDate, lat, lng);
            const testAlt = testPos.altitude * 180 / Math.PI;
            const testAz = ((testPos.azimuth * 180 / Math.PI) + 180) % 360;

            if (testAlt > 0) {
                // Quick check: is sun blocked by terrain?
                const isBlocked = checkTerrainBlocking(lat, lng, elevation, testAz, testAlt);
                if (!isBlocked) {
                    terrainSunrise = testDate;
                    break;
                }
            }
        }
    }

    // Check if terrain blocks sunset (western mountains)
    if (sunTimes.sunset && !isNaN(sunTimes.sunset.getTime())) {
        // Walk backward from astronomical sunset
        for (let i = 0; i < 180; i += 5) {
            const testDate = new Date(sunTimes.sunset.getTime() - i * 60 * 1000);
            const testPos = SunCalc.getPosition(testDate, lat, lng);
            const testAlt = testPos.altitude * 180 / Math.PI;
            const testAz = ((testPos.azimuth * 180 / Math.PI) + 180) % 360;

            if (testAlt > 0) {
                const isBlocked = checkTerrainBlocking(lat, lng, elevation, testAz, testAlt);
                if (!isBlocked) {
                    terrainSunset = testDate;
                } else {
                    break;
                }
            }
        }
    }

    return {
        sunrise: terrainSunrise,
        sunset: terrainSunset
    };
}

// Check if terrain blocks sun at given azimuth and altitude (same as original)
function checkTerrainBlocking(lat, lng, elevation, azimuth, altitude) {
    const maxDistance = 5000; // 5km max
    const stepSize = 200; // Coarser sampling for speed

    const azRad = azimuth * Math.PI / 180;
    const altRad = altitude * Math.PI / 180;

    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(lat * Math.PI / 180);

    const latStep = (Math.cos(azRad) * stepSize) / metersPerDegreeLat;
    const lngStep = (Math.sin(azRad) * stepSize) / metersPerDegreeLng;

    let currentLat = lat;
    let currentLng = lng;
    let distance = 0;

    while (distance < maxDistance) {
        distance += stepSize;
        currentLat += latStep;
        currentLng += lngStep;

        const rayHeight = elevation + distance * Math.tan(altRad);
        const terrainHeight = map.queryTerrainElevation([currentLng, currentLat], { exaggerated: false });

        if (terrainHeight === null || terrainHeight === undefined) break;
        if (terrainHeight > rayHeight) return true; // Blocked
        if (rayHeight - terrainHeight > 500) break; // Ray far above
    }

    return false; // Not blocked
}

// Calculate when sun hits and leaves this specific slope
function calculateSlopeSunTimes(lat, lng, terrainData) {
    const date = currentDate;
    let slopeStartTime = null;
    let slopeEndTime = null;
    let lastExposedTime = null;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    let wasExposed = false;

    // Check every 15 minutes throughout the day
    for (let minutes = 0; minutes < 1440; minutes += 15) {
        const testTime = new Date(startOfDay);
        testTime.setMinutes(minutes);

        const sunPos = SunCalc.getPosition(testTime, lat, lng);
        const sunAltitude = sunPos.altitude * 180 / Math.PI;
        const sunAzimuth = ((sunPos.azimuth * 180 / Math.PI) + 180) % 360;

        // Check if sun is above horizon
        if (sunAltitude <= 0) {
            if (wasExposed) {
                slopeEndTime = lastExposedTime;
                wasExposed = false;
            }
            continue;
        }

        // Check if sun is blocked by terrain
        const sunBlocked = checkTerrainBlocking(lat, lng, terrainData.elevation, sunAzimuth, sunAltitude);

        // Check if sun is facing the slope (dot product test)
        const slopeFacing = isSlopeFacingSun(
            terrainData.aspect,
            terrainData.slope,
            sunAzimuth,
            sunAltitude
        );

        // Slope is exposed if: sun above horizon, not blocked, and facing slope
        const isExposed = !sunBlocked && slopeFacing;

        if (isExposed) {
            lastExposedTime = new Date(testTime);

            if (!wasExposed) {
                slopeStartTime = new Date(testTime);
                wasExposed = true;
            }
        } else if (wasExposed) {
            slopeEndTime = new Date(testTime);
            wasExposed = false;
        }
    }

    // If still exposed at end of day, use last exposure time
    if (wasExposed && lastExposedTime) {
        slopeEndTime = lastExposedTime;
    }

    return {
        slopeStart: slopeStartTime,
        slopeEnd: slopeEndTime
    };
}

// Check if sun is facing the slope
function isSlopeFacingSun(aspect, slope, sunAzimuth, sunAltitude) {
    const slopeRad = slope * Math.PI / 180;
    const aspectRad = aspect * Math.PI / 180;
    const sunAltRad = sunAltitude * Math.PI / 180;
    const sunAzRad = sunAzimuth * Math.PI / 180;

    // Slope normal vector (pointing outward from slope surface)
    const slopeNx = Math.sin(slopeRad) * Math.sin(aspectRad);
    const slopeNy = Math.sin(slopeRad) * Math.cos(aspectRad);
    const slopeNz = Math.cos(slopeRad);

    // Sun direction vector (pointing toward sun)
    const sunDx = Math.cos(sunAltRad) * Math.sin(sunAzRad);
    const sunDy = Math.cos(sunAltRad) * Math.cos(sunAzRad);
    const sunDz = Math.sin(sunAltRad);

    // Dot product - positive means sun is facing the slope
    const dotProduct = slopeNx * sunDx + slopeNy * sunDy + slopeNz * sunDz;

    return dotProduct > 0;
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
