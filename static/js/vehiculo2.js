const VEHICULO_2 = "2";
const COLOR_VEHICULO_2 = "#0891b2";

let lineaVehiculo2 = L.polyline([], { color: COLOR_VEHICULO_2, weight: 4, opacity: 0.85 });
let marcadorVehiculo2 = L.marker([0, 0], {
    icon: L.divIcon({
        html: '<div class="icono-vehiculo2">2</div>',
        className: "",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -14]
    }),
    zIndexOffset: 400
}).bindPopup("")
    .on("popupopen", () => { window.popupAbierto = true; })
    .on("popupclose", () => {
        window.popupAbierto = false;
        viendoVehiculo2 = false;
        actualizarBotonVehiculo();
    });
let ultimoVehiculo2 = null;
let viendoVehiculo2 = false;

function ocultarVehiculo2() {
    mapa.removeLayer(lineaVehiculo2);
    mapa.removeLayer(marcadorVehiculo2);
    document.getElementById("seccionVehiculo2").style.display = "none";
    viendoVehiculo2 = false;
    actualizarBotonVehiculo();
}

function mostrarDatosVehiculo2(puntos) {
    const n = puntos.length;
    const caja = document.getElementById("seccionVehiculo2");
    if (n === 0) {
        ultimoVehiculo2 = null;
        caja.style.display = "none";
        ocultarVehiculo2();
        return;
    }
    const ultimo = puntos[n - 1];
    const velocidad = n >= 2 ? velocidadKmh(puntos[n - 2], ultimo) : null;
    const segundosSinSenal = (Date.now() - aFecha(ultimo)) / 1000;
    const estado = estadoVehiculo(velocidad, segundosSinSenal);
    ultimoVehiculo2 = [ultimo.latitud, ultimo.longitud];

    caja.style.display = "block";
    document.getElementById("v2Estado").textContent = estado.texto;
    document.getElementById("v2Estado").className = "valor " + estado.clase;
    document.getElementById("v2Velocidad").textContent = (velocidad ?? "--") + " km/h";
    document.getElementById("v2Senal").textContent = textoHace(segundosSinSenal);
    document.getElementById("v2Hora").textContent = ultimo.hora;

    marcadorVehiculo2.setLatLng(ultimoVehiculo2);
    marcadorVehiculo2.setPopupContent(
        '<div class="popup-vehiculo2"><b>Vehículo 2</b><br>' +
        ultimo.fecha + " · " + ultimo.hora + "<br>" +
        (velocidad ?? "--") + " km/h · " + estado.texto + "</div>"
    );
    lineaVehiculo2.setLatLngs(construirRutaFiltrada(puntos));
    if (!modoHistorico) {
        lineaVehiculo2.addTo(mapa);
        marcadorVehiculo2.addTo(mapa);
    }
}

function actualizarVehiculo2() {
    if (modoHistorico) {
        ocultarVehiculo2();
        return;
    }
    fetch("/api/recorrido?vehiculo=" + VEHICULO_2)
        .then(r => r.json())
        .then(puntos => {
            if (!modoHistorico) mostrarDatosVehiculo2(puntos);
        })
        .catch(error => console.error("Error cargando vehículo 2:", error));
}

function actualizarBotonVehiculo() {
    document.getElementById("btnVerVehiculo").textContent =
        viendoVehiculo2 ? "Ver vehículo 1" : "Ver en el mapa";
}

function cerrarMenuEnCelular() {
    if (window.innerWidth <= 600 && document.getElementById("sidebar").classList.contains("abierta")) {
        toggleSidebar();
    }
}

function verVehiculo1() {
    viendoVehiculo2 = false;
    marcadorVehiculo2.closePopup();
    cerrarMenuEnCelular();
    mapa.setView(marcador.getLatLng(), 16);
    actualizarBotonVehiculo();
}

function verVehiculo2() {
    if (viendoVehiculo2) {
        verVehiculo1();
        return;
    }
    if (!ultimoVehiculo2) return;
    cerrarMenuEnCelular();
    mapa.setView(ultimoVehiculo2, 16);
    marcadorVehiculo2.openPopup();
    viendoVehiculo2 = true;
    actualizarBotonVehiculo();
}

actualizarVehiculo2();
setInterval(actualizarVehiculo2, 10000);
