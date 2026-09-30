const NOMINATIM = "https://nominatim.openstreetmap.org/search?format=json&countrycodes=co&addressdetails=1&accept-language=es";
const TIPOS_VIA = { calle: "Calle", clle: "Calle", cll: "Calle", cl: "Calle",
                    carrera: "Carrera", carr: "Carrera", kra: "Carrera", cra: "Carrera", kr: "Carrera", cr: "Carrera" };

function leerDireccion(texto) {
    texto = texto.replace(/\s+n[.°º]?\s+(?=\d)/i, " # ");
    const m = texto.match(/^(calle|clle|cll|cl|carrera|carr|kra|cra|kr|cr)\.?\s*(\d+)\s*([a-z])?\s*(?:bis\s*)?(?:#|no\.?|n°|nº|n[uú]mero)?\s*(\d+)\s*([a-z])?\s*(?:-\s*(\d+))?\s*$/i);
    if (!m) return null;
    const via = TIPOS_VIA[m[1].toLowerCase()];
    const [letraVia, letraCruce] = [(m[3] || "").toUpperCase(), (m[5] || "").toUpperCase()];
    return {
        via: via + " " + m[2] + letraVia,
        regexVia: "^" + via + " " + m[2] + (letraVia ? " ?" + letraVia : "") + "$",
        cruce: via === "Calle" ? "Carrera" : "Calle",
        numCruce: m[4], letraCruce: letraCruce, metros: Number(m[6] || 0),
        texto: via + " " + m[2] + letraVia + " #" + m[4] + letraCruce + (m[6] ? "-" + m[6] : "")
    };
}

function buscarCruce(regexVia, regexCruce, cerca) {
    const caja = [cerca.lat - 0.04, cerca.lng - 0.04, cerca.lat + 0.04, cerca.lng + 0.04].join(",");
    const consulta = '[out:json][timeout:15];way["highway"]["name"~"' + regexVia + '",i](' + caja + ')->.a;' +
                     'way["highway"]["name"~"' + regexCruce + '",i](' + caja + ')->.b;node(w.a)(w.b);out;';
    const pedir = servidor => fetch(servidor + "?data=" + encodeURIComponent(consulta))
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    return pedir("https://overpass-api.de/api/interpreter")
        .catch(() => pedir("https://overpass.kumi.systems/api/interpreter"))
        .then(d => {
            const nodos = d.elements.map(n => L.latLng(n.lat, n.lon));
            nodos.sort((a, b) => a.distanceTo(cerca) - b.distanceTo(cerca));
            return nodos[0] || null;
        })
        .catch(() => null);
}

function ubicarDireccion(d, cerca) {
    const regexCruce = (num, letra) => "^" + d.cruce + " " + num + (letra ? " ?" + letra : "") + "$";
    return buscarCruce(d.regexVia, regexCruce(d.numCruce, d.letraCruce), cerca).then(esquina => {
        if (!esquina || !d.metros) return esquina;
        return buscarCruce(d.regexVia, regexCruce(Number(d.numCruce) + 1, ""), esquina).then(siguiente => {
            if (!siguiente || esquina.distanceTo(siguiente) > 400) return esquina;
            const f = Math.min(d.metros / esquina.distanceTo(siguiente), 1);
            return L.latLng(esquina.lat + (siguiente.lat - esquina.lat) * f,
                            esquina.lng + (siguiente.lng - esquina.lng) * f);
        });
    });
}

function ciudadDe(lugar) {
    const a = lugar.address || {};
    return [a.city || a.town || a.village || a.municipality || a.county, a.state].filter(Boolean).join(", ");
}

function mostrarOpciones(opciones, direccion) {
    const resultados = document.getElementById("resultadosDireccion");
    resultados.innerHTML = opciones.length ? "" : '<div class="lista-titulo">No encontrada</div>';
    opciones.forEach(l => {
        const punto = L.latLng(l.lat, l.lon);
        const nombre = direccion ? direccion.texto + ", " + ciudadDe(l)
                                 : l.display_name.replace(/, Colombia$/, "");
        const boton = document.createElement("button");
        boton.className = "item-recorrido";
        boton.textContent = nombre;
        boton.onclick = () => {
            resultados.innerHTML = '<div class="lista-titulo">…</div>';
            const ubicar = direccion ? ubicarDireccion(direccion, punto) : Promise.resolve(null);
            ubicar.then(exacto => {
                resultados.innerHTML = "";
                marcarLugar(exacto || punto, true, nombre);
            });
        };
        resultados.appendChild(boton);
    });
}

function buscarDireccion() {
    const escrito = document.getElementById("textoDireccion").value.trim();
    if (!escrito) return;
    const resultados = document.getElementById("resultadosDireccion");
    resultados.innerHTML = '<div class="lista-titulo">…</div>';

    const partes = escrito.split(",");
    const ciudad = partes.length > 1 && !/\d/.test(partes[partes.length - 1]) ? partes.pop().trim() : "";
    const texto = partes.join(",").trim();
    const direccion = leerDireccion(texto);
    const consulta = (direccion ? direccion.via : texto) + (ciudad ? ", " + ciudad : "");

    fetch(NOMINATIM + "&limit=20&q=" + encodeURIComponent(consulta))
        .then(r => r.json())
        .then(lugares => {
            const centro = mapa.getCenter();
            lugares.sort((a, b) => centro.distanceTo([a.lat, a.lon]) - centro.distanceTo([b.lat, b.lon]));
            const vistas = new Set();
            const opciones = lugares.filter(l => {
                const clave = direccion ? ciudadDe(l) : l.display_name;
                if (vistas.has(clave)) return false;
                vistas.add(clave);
                return true;
            });
            mostrarOpciones(opciones.slice(0, 6), direccion);
        })
        .catch(() => { resultados.innerHTML = '<div class="lista-titulo">Buscador no disponible</div>'; });
}
