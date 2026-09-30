function distanciaMetrosAprox(p1, p2) {
    const dLat = (p2[0] - p1[0]) * 111000;
    const dLon = (p2[1] - p1[1]) * 111000 * Math.cos(p1[0] * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
}

function construirRutaFiltrada(puntosCrudos) {
    const ruta = [];
    let rechazosSeguidos = 0;
    for (const p of puntosCrudos) {
        const lat = Math.round(p.latitud * 10000) / 10000;
        const lon = Math.round(p.longitud * 10000) / 10000;
        const nuevoPunto = [lat, lon];
        const anterior = ruta[ruta.length - 1];

        if (!anterior) {
            ruta.push(nuevoPunto);
            continue;
        }

        const esDistinto = anterior[0] !== nuevoPunto[0] || anterior[1] !== nuevoPunto[1];
        if (!esDistinto) continue;

        const esRazonable = distanciaMetrosAprox(anterior, nuevoPunto) < 500;
        if (esRazonable) {
            ruta.push(nuevoPunto);
            rechazosSeguidos = 0;
        } else {
            rechazosSeguidos++;
            if (rechazosSeguidos >= 2) {
                ruta.length = 0;
                ruta.push(nuevoPunto);
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
            actual = { puntos: [nuevoPunto], inicio: p, fin: p, ultimoMovimiento: momento };
            continue;
        }

        const anterior = actual.puntos[actual.puntos.length - 1];
        const esDistinto = anterior[0] !== nuevoPunto[0] || anterior[1] !== nuevoPunto[1];
        if (!esDistinto) continue;

        const esSalto = distanciaMetrosAprox(anterior, nuevoPunto) >= 500;
        if (esSalto) {
            rechazosSeguidos++;
            if (rechazosSeguidos < 2) continue;
        }
        rechazosSeguidos = 0;

        const minutosQuieto = (momento - actual.ultimoMovimiento) / 60000;
        if (esSalto || minutosQuieto > MINUTOS_PARA_SEPARAR) {
            recorridos.push(actual);
            actual = { puntos: [nuevoPunto], inicio: p, fin: p, ultimoMovimiento: momento };
        } else {
            actual.puntos.push(nuevoPunto);
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
