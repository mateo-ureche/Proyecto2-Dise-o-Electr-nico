flatpickr.localize(flatpickr.l10ns.es);
const configPicker = {
    enableTime: true,
    time_24hr: true,
    dateFormat: "Y-m-dTH:i",
    altInput: true,
    altFormat: "d/m/Y H:i",
    minDate: "2026-09-16T13:35",
    maxDate: new Date(),
    disableMobile: true
};
const pickerInicio = flatpickr("#fechaInicio", {
    ...configPicker,
    defaultHour: 0,
    defaultMinute: 0,
    onChange: ([fecha]) => pickerFin.set("minDate", fecha || configPicker.minDate)
});
const pickerFin = flatpickr("#fechaFin", {
    ...configPicker,
    defaultHour: 23,
    defaultMinute: 59,
    onChange: ([fecha]) => pickerInicio.set("maxDate", fecha || configPicker.maxDate)
});

let mapa = L.map('mapa', { zoomControl: false, preferCanvas: true }).setView([10.9878, -74.7889], 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    updateWhenIdle: true,
    keepBuffer: 4,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(mapa);

L.control.zoom({ position: 'topright' }).addTo(mapa);

const iconoInicio = L.divIcon({
    html: '<div style="font-size:22px; transform:translateY(-4px);">🟢</div>',
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});
const iconoFin = L.divIcon({
    html: '<div style="font-size:22px;">🏁</div>',
    className: '',
    iconSize: [24, 24],
    iconAnchor: [4, 20]
});

let marcador = L.marker([10.9878, -74.7889]).addTo(mapa);
let lineaRecorrido = L.polyline([], { color: '#2563eb', weight: 4 }).addTo(mapa);
let lineaHistorica = L.polyline([], { color: '#7c3aed', weight: 4, dashArray: '8, 6' });
let marcadorInicioHoy = L.marker([0, 0], { icon: iconoInicio });
let marcadorInicioHist = L.marker([0, 0], { icon: iconoInicio });
let marcadorFinHist = L.marker([0, 0], { icon: iconoFin });
let marcadorTiempo = L.circleMarker([0, 0], { radius: 10, color: '#ffffff', weight: 3, fillColor: '#AF043C', fillOpacity: 1 });
let primeraCarga = true;
let modoHistorico = false;
let recorridosHistoricos = [];