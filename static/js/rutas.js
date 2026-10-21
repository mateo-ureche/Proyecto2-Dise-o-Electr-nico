
function velocidadKmh(r1, r2) {
    const metros = distanciaMetrosAprox([Number(r1.latitud), Number(r1.longitud)], [Number(r2.latitud), Number(r2.longitud)]);
    const segundos = Math.abs(aFecha(r2) - aFecha(r1)) / 1000;
    if (segundos === 0) return 0;
    const kmh = metros / segundos * 3.6;
    return kmh > VELOCIDAD_MAXIMA_KMH ? null : Math.round(kmh);
}

function distanciaKm(puntos) {
    let metros = 0;
    for (let i = 1; i < puntos.length; i++) {
        metros += distanciaMetrosAprox(puntos[i - 1], puntos[i]);
    }
    return (metros / 1000).toFixed(1).replace(".", ",");
}

const KMH_MOVIMIENTO = 3;
const MINUTOS_PARADA = 3;

function resumenRecorrido(registros) {
    const resumen = { maxima: 0, promedio: 0, segMovimiento: 0, segDetenido: 0, paradas: 0 };
    let metros = 0;
    let segQuieto = 0;
    for (let i = 1; i < registros.length; i++) {
        const segundos = (aFecha(registros[i]) - aFecha(registros[i - 1])) / 1000;
        const kmh = velocidadKmh(registros[i - 1], registros[i]);
        if (segundos <= 0 || kmh === null) continue;
        if (kmh >= KMH_MOVIMIENTO) {
            resumen.maxima = Math.max(resumen.maxima, kmh);
            metros += kmh / 3.6 * segundos;
            resumen.segMovimiento += segundos;
            segQuieto = 0;
        } else {
            if (segQuieto < MINUTOS_PARADA * 60 && segQuieto + segundos >= MINUTOS_PARADA * 60) resumen.paradas++;
            segQuieto += segundos;
            resumen.segDetenido += segundos;
        }
    }
    if (resumen.segMovimiento > 0) resumen.promedio = Math.round(metros / resumen.segMovimiento * 3.6);
    return resumen;
}

function estadoVehiculo(velocidad, segundosSinSenal) {
    if (segundosSinSenal > 120) return "⚪ Sin señal";
    if (velocidad === null) return "---";
    return velocidad >= KMH_MOVIMIENTO ? "🟢 En movimiento" : "🟠 Detenido";
}

function textoDuracion(segundos) {
    const minutos = Math.round(segundos / 60);
    if (minutos < 60) return minutos + " min";
    return Math.floor(minutos / 60) + " h " + (minutos % 60) + " min";
}

function textoHace(segundos) {
    const s = Math.max(0, Math.round(segundos));
    if (s < 60) return "hace " + s + " s";
    if (s < 3600) return "hace " + Math.round(s / 60) + " min";
    return "hace " + Math.round(s / 3600) + " h";
}

const OSRM_MATCH = "https://router.project-osrm.org/match/v1/driving/";
const PUNTOS_POR_PEDIDO = 100;

function pedirTramo(puntos) {
    const coordenadas = puntos.map(p => p[1].toFixed(5) + "," + p[0].toFixed(5)).join(";");
    const radios = puntos.map(() => 25).join(";");
    return fetch(OSRM_MATCH + coordenadas + "?overview=full&geometries=geojson&tidy=true&radiuses=" + radios)
        .then(r => r.json())
        .then(d => d.code === "Ok"
            ? d.matchings.flatMap(m => m.geometry.coordinates.map(c => [c[1], c[0]]))
            : puntos)
        .catch(() => puntos);
}

function pegarACalles(puntos) {
    if (puntos.length < 2) return Promise.resolve(puntos);
    const tramos = [];
    for (let i = 0; i < puntos.length - 1; i += PUNTOS_POR_PEDIDO - 1) {
        tramos.push(puntos.slice(i, i + PUNTOS_POR_PEDIDO));
    }
    let linea = [];
    return tramos.reduce(
        (cadena, tramo) => cadena.then(() => pedirTramo(tramo)).then(parte => { linea = linea.concat(parte); }),
        Promise.resolve()
    ).then(() => linea);
}