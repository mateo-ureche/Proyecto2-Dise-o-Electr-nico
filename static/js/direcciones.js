// Buscador de direcciones para cualquier ciudad de Colombia.
// "Calle 79B #42-83" = sobre la Calle 79B, a 83 m de la Carrera 42 (hacia la Carrera 43).
// Opcional: la ciudad después de una coma ("Calle 79B #42-83, Medellín"). Si no, la ciudad del mapa.

const NOMINATIM = "https://nominatim.openstreetmap.org/";
const TIPOS_VIA = { calle: "Calle", clle: "Calle", cll: "Calle", cl: "Calle",
                    carrera: "Carrera", carr: "Carrera", kra: "Carrera", cra: "Carrera", kr: "Carrera", cr: "Carrera" };

function leerDireccion(texto) {
    texto = texto.replace(/\s+n[.°º]?\s+(?=\d)/i, " # ");  // "Calle 50 N 42-83": la N es "número"
    const m = texto.match(/^(calle|clle|cll|cl|carrera|carr|kra|cra|kr|cr)\.?\s*(\d+)\s*([a-z])?\s*(?:bis\s*)?(?:#|no\.?|n°|nº|n[uú]mero)?\s*(\d+)\s*([a-z])?\s*-\s*(\d+)/i);
    if (!m) return null;
    const via = TIPOS_VIA[m[1].toLowerCase()];
    const [letraVia, letraCruce] = [(m[3] || "").toUpperCase(), (m[5] || "").toUpperCase()];
    return {
        via: via + " " + m[2] + letraVia,
        regexVia: "^" + via + " " + m[2] + (letraVia ? " ?" + letraVia : "") + "$",
        cruce: via === "Calle" ? "Carrera" : "Calle",
        numCruce: m[4], letraCruce: letraCruce, metros: Number(m[6]),
        texto: via + " " + m[2] + letraVia + " #" + m[4] + letraCruce + "-" + m[6]
    };
}

// Caja de la ciudad escrita, o de la ciudad donde está el mapa
function zonaDeBusqueda(ciudad) {
    const c = mapa.getCenter();
    const url = ciudad
        ? NOMINATIM + "search?format=json&limit=1&countrycodes=co&q=" + encodeURIComponent(ciudad)
        : NOMINATIM + "reverse?format=json&zoom=10&lat=" + c.lat + "&lon=" + c.lng;
    return fetch(url + "&accept-language=es")
        .then(r => r.json())
        .then(d => {
            const lugar = Array.isArray(d) ? d[0] : d;
            const [sur, norte, oeste, este] = lugar.boundingbox.map(Number);
            return { sur, oeste, norte, este, centro: L.latLng(lugar.lat, lugar.lon),
                     nombre: lugar.display_name.split(",")[0] };
        })
        .catch(() => ({ sur: c.lat - 0.15, oeste: c.lng - 0.15, norte: c.lat + 0.15, este: c.lng + 0.15,
                        centro: c, nombre: "" }));
}

// Overpass (OpenStreetMap): puntos donde se cruzan dos calles dentro de la zona.
// Si el mismo cruce existe en otro municipio, se queda con el más cercano a "cerca".
function buscarCruce(regexVia, regexCruce, zona, cerca) {
    const caja = [zona.sur, zona.oeste, zona.norte, zona.este].join(",");
    const consulta = '[out:json][timeout:15];way["highway"]["name"~"' + regexVia + '",i](' + caja + ')->.a;' +
                     'way["highway"]["name"~"' + regexCruce + '",i](' + caja + ')->.b;node(w.a)(w.b);out;';
    const pedir = servidor => fetch(servidor + "?data=" + encodeURIComponent(consulta))
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    return pedir("https://overpass-api.de/api/interpreter")
        .catch(() => pedir("https://overpass.kumi.systems/api/interpreter"))
        .then(d => {
            const nodos = d.elements.map(n => L.latLng(n.lat, n.lon));
            if (nodos.length === 0) return null;
            nodos.sort((a, b) => a.distanceTo(cerca) - b.distanceTo(cerca));
            return nodos[0];
        })
        .catch(() => null);
}

function ubicarDireccion(d, zona) {
    const regexCruce = (num, letra) => "^" + d.cruce + " " + num + (letra ? " ?" + letra : "") + "$";
    return buscarCruce(d.regexVia, regexCruce(d.numCruce, d.letraCruce), zona, zona.centro).then(esquina => {
        if (!esquina) return null;
        return buscarCruce(d.regexVia, regexCruce(Number(d.numCruce) + 1, ""), zona, esquina).then(siguiente => {
            if (!siguiente || esquina.distanceTo(siguiente) > 400) return esquina;
            const f = Math.min(d.metros / esquina.distanceTo(siguiente), 1);
            return L.latLng(esquina.lat + (siguiente.lat - esquina.lat) * f,
                            esquina.lng + (siguiente.lng - esquina.lng) * f);
        });
    });
}

// Nombres de lugares ("Universidad del Norte") o, si falla el cruce, la calle sola
function buscarEnNominatim(texto, titulo, zona) {
    const resultados = document.getElementById("resultadosDireccion");
    const url = NOMINATIM + "search?format=json&limit=5&countrycodes=co&accept-language=es&viewbox=" +
                [zona.oeste, zona.norte, zona.este, zona.sur].join(",") + "&q=" + encodeURIComponent(texto);
    fetch(url)
        .then(r => r.json())
        .then(lugares => {
            resultados.innerHTML = lugares.length ? "" : '<div class="lista-titulo">No encontrada</div>';
            const nombre = l => titulo || l.display_name.replace(/, Colombia$/, "");
            if (lugares.length === 1 || (titulo && lugares.length)) {
                return marcarLugar(L.latLng(lugares[0].lat, lugares[0].lon), true, nombre(lugares[0]));
            }
            lugares.forEach(l => {
                const boton = document.createElement("button");
                boton.className = "item-recorrido";
                boton.textContent = nombre(l);
                boton.onclick = () => { resultados.innerHTML = ""; marcarLugar(L.latLng(l.lat, l.lon), true, nombre(l)); };
                resultados.appendChild(boton);
            });
        })
        .catch(() => { resultados.innerHTML = '<div class="lista-titulo">Buscador no disponible</div>'; });
}

function buscarDireccion() {
    const escrito = document.getElementById("textoDireccion").value.trim();
    if (!escrito) return;
    document.getElementById("resultadosDireccion").innerHTML = '<div class="lista-titulo">…</div>';

    // Lo que va después de la última coma (sin números) es la ciudad
    const partes = escrito.split(",");
    const ciudad = partes.length > 1 && !/\d/.test(partes[partes.length - 1]) ? partes.pop().trim() : "";
    const texto = partes.join(",").trim();
    const direccion = leerDireccion(texto);

    zonaDeBusqueda(ciudad).then(zona => {
        const enCiudad = zona.nombre ? ", " + zona.nombre : "";
        if (!direccion) return buscarEnNominatim(texto + (ciudad ? ", " + ciudad : ""), null, zona);
        ubicarDireccion(direccion, zona).then(punto => {
            console.log("Dirección:", direccion.texto + enCiudad, "→", punto);
            if (!punto) return buscarEnNominatim(direccion.via + enCiudad, direccion.texto + enCiudad, zona);
            document.getElementById("resultadosDireccion").innerHTML = "";
            marcarLugar(punto, true, direccion.texto + enCiudad);
        });
    });
}
