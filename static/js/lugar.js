const TOLERANCIA_METROS = 30;
const MAXIMO_FUERA_DE_CALLE = 60;
var modoLugar = false;
var popupAbierto = false;

const marcadorLugar = L.marker([0, 0], {
    icon: L.divIcon({ html: '<div style="font-size:30px;">📍</div>', className: '',
                      iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] }),
    draggable: true
});

function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
}

function textoPasada(p) {
    const duracion = p.minutos < 1 ? "<1 min" : Math.round(p.minutos) + " min";
    return p.entrada.fecha.slice(0, 5) + " · " + p.entrada.hora.slice(0, 5) + "–" +
           p.salida.hora.slice(0, 5) + " · " + duracion;
}

function htmlVeces(pasadas) {
    const n = pasadas.length;
    if (n === 0) return "No ha pasado por aquí";
    const lista = pasadas.map(p => "<li>" + escaparHtml(textoPasada(p)) + "</li>").join("");
    return "Pasó " + (n === 1 ? "1 vez" : n + " veces") + " por aquí" +
           '<details class="veces-popup"><summary>Ver cuándo</summary><ul>' + lista + "</ul></details>";
}

function urlPasadas(punto) {
    let url = "/api/pasadas?lat=" + punto.lat.toFixed(6) + "&lon=" + punto.lng.toFixed(6) + "&radio=" + TOLERANCIA_METROS;
    const inicio = document.getElementById("fechaInicio").value;
    const fin = document.getElementById("fechaFin").value;
    return url + "&inicio=" + encodeURIComponent(inicio) + "&fin=" + encodeURIComponent(fin);
}

function activarModoLugar() {
    if (modoLugar) return terminarModoLugar();
    modoLugar = true;
    document.getElementById("btnCuandoPaso").textContent = "✖ Terminar";
    document.getElementById("avisoLugar").style.display = "block";
    document.getElementById("mapa").classList.add("modo-lugar");
    if (document.getElementById("sidebar").classList.contains("abierta")) toggleSidebar();
}

function terminarModoLugar() {
    modoLugar = false;
    mapa.removeLayer(marcadorLugar);
    mapa.closePopup();
    document.getElementById("btnCuandoPaso").textContent = "📍 Marcar en el mapa";
    document.getElementById("avisoLugar").style.display = "none";
    document.getElementById("mapa").classList.remove("modo-lugar");
}

function ajustarACalle(punto) {
    const url = "https://router.project-osrm.org/nearest/v1/driving/" +
                punto.lng.toFixed(6) + "," + punto.lat.toFixed(6) + "?number=1";
    return fetch(url)
        .then(r => r.json())
        .then(d => d.code === "Ok"
            ? { punto: L.latLng(d.waypoints[0].location[1], d.waypoints[0].location[0]),
                distancia: d.waypoints[0].distance, calle: d.waypoints[0].name }
            : null)
        .catch(() => ({ punto: punto, distancia: 0, calle: "" }));
}

function marcarLugar(punto) {
    if (!modoLugar) activarModoLugar();
    ajustarACalle(punto).then(calle => {
        const lejos = !calle || calle.distancia > MAXIMO_FUERA_DE_CALLE;
        if (lejos) {
            L.popup().setLatLng(punto).setContent("Toca sobre una calle").openOn(mapa);
            return;
        }

        const titulo = "<b>📍 " + escaparHtml(calle.calle || "Este punto") + "</b><br>";
        marcadorLugar.setLatLng(calle.punto).addTo(mapa).unbindPopup()
            .bindPopup(titulo + "…", { minWidth: 200 }).openPopup();

        fetch(urlPasadas(calle.punto))
            .then(r => r.json())
            .then(d => marcadorLugar.setPopupContent(titulo + (d.error ? escaparHtml(d.error) : htmlVeces(d.pasadas))))
            .catch(() => marcadorLugar.setPopupContent(titulo + "Error del servidor"));
    });
}

function tocoLaRuta(e) {
    const puntos = lineaHistorica.getLatLngs().map(p => mapa.latLngToLayerPoint(p));
    const toque = mapa.latLngToLayerPoint(e.latlng);
    for (let i = 1; i < puntos.length; i++) {
        if (L.LineUtil.pointToSegmentDistance(toque, puntos[i - 1], puntos[i]) < 15) return true;
    }
    return false;
}

mapa.on("click", e => {
    if (modoHistorico && (modoLugar || tocoLaRuta(e))) marcarLugar(e.latlng);
});
marcadorLugar.on("dragend", () => marcarLugar(marcadorLugar.getLatLng()));
mapa.on("popupopen", () => { popupAbierto = true; });
mapa.on("popupclose", () => { popupAbierto = false; });
