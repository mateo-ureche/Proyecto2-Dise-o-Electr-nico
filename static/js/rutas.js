function distanciaMetrosAprox(p1, p2) {
    const dLat = (p2[0] - p1[0]) * 111000;
    const dLon = (p2[1] - p1[1]) * 111000 * Math.cos(p1[0] * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
}
 
const VELOCIDAD_MAXIMA_KMH = 150;
 
function esSalto(anterior, momentoAnterior, nuevoPunto, momento) {
    const metros = distanciaMetrosAprox(anterior, nuevoPunto);
    const segundos = (momento - momentoAnterior) / 1000;
    if (segundos <= 0) return metros >= 500;
    return metros / segundos * 3.6 > VELOCIDAD_MAXIMA_KMH;
}
 
function construirRutaFiltrada(puntosCrudos) {
    const ruta = [];
    let momentoAnterior = null;
    let rechazosSeguidos = 0;
    for (const p of puntosCrudos) {
        const lat = Math.round(p.latitud * 10000) / 10000;
        const lon = Math.round(p.longitud * 10000) / 10000;
        const nuevoPunto = [lat, lon];
        const momento = aFecha(p);
        const anterior = ruta[ruta.length - 1];
 
        if (!anterior) {
            ruta.push(nuevoPunto);
            momentoAnterior = momento;
            continue;
        }
 
        const esDistinto = anterior[0] !== nuevoPunto[0] || anterior[1] !== nuevoPunto[1];
        if (!esDistinto) continue;
 
        if (!esSalto(anterior, momentoAnterior, nuevoPunto, momento)) {
            ruta.push(nuevoPunto);
            momentoAnterior = momento;
            rechazosSeguidos = 0;
        } else {
            rechazosSeguidos++;
            if (rechazosSeguidos >= 2) {
                ruta.length = 0;
                ruta.push(nuevoPunto);
                momentoAnterior = momento;
                rechazosSeguidos = 0;
            }
        }
    }
    return ruta;
}
 
const MINUTOS_PARA_SEPARAR = 10;
const PUNTOS_MINIMOS = 3;
 
function aFecha(p) {
    const [dia, mes, anio] = p.fecha.split("/");
    return new Date(anio + "-" + mes + "-" + dia + "T" + p.hora);
}
 
function construirRecorridos(puntosCrudos) {
    const recorridos = [];
    let actual = null;
    let rechazosSeguidos = 0;
 
    for (const p of puntosCrudos) {
        const lat = Math.round(p.latitud * 10000) / 10000;
        const lon = Math.round(p.longitud * 10000) / 10000;
        const nuevoPunto = [lat, lon];
        const momento = aFecha(p);
 
        if (actual === null) {
            actual = { puntos: [nuevoPunto], registros: [p], inicio: p, fin: p, ultimoMovimiento: momento };
            continue;
        }
 
        const anterior = actual.puntos[actual.puntos.length - 1];
        const esDistinto = anterior[0] !== nuevoPunto[0] || anterior[1] !== nuevoPunto[1];
        if (!esDistinto) continue;
 
        const momentoAnterior = aFecha(actual.registros[actual.registros.length - 1]);
        const saltoImposible = esSalto(anterior, momentoAnterior, nuevoPunto, momento);
        if (saltoImposible) {
            rechazosSeguidos++;
            if (rechazosSeguidos < 2) continue;
        }
        rechazosSeguidos = 0;
 
        const minutosQuieto = (momento - actual.ultimoMovimiento) / 60000;
        if (saltoImposible || minutosQuieto > MINUTOS_PARA_SEPARAR) {
            recorridos.push(actual);
            actual = { puntos: [nuevoPunto], registros: [p], inicio: p, fin: p, ultimoMovimiento: momento };
        } else {
            actual.puntos.push(nuevoPunto);
            actual.registros.push(p);
            actual.fin = p;
            actual.ultimoMovimiento = momento;
        }
    }
    if (actual !== null) recorridos.push(actual);
 
    return recorridos.filter(r => r.puntos.length >= PUNTOS_MINIMOS);
}
 
function textoRecorrido(r) {
    const horaInicio = r.inicio.hora.slice(0, 5);
    const horaFin = r.fin.hora.slice(0, 5);
    if (r.inicio.fecha === r.fin.fecha) {
        return r.inicio.fecha + "  " + horaInicio + " → " + horaFin;
    }
    return r.inicio.fecha + " " + horaInicio + " → " + r.fin.fecha + " " + horaFin;
}
 
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
 