from flask import Flask, jsonify, render_template, request
from dotenv import load_dotenv
from datetime import datetime, timedelta
import psycopg2
import os
import math
 
load_dotenv()
 
app = Flask(__name__)
 
PROPIETARIO = os.environ.get("DOMINIO", "desconocido")
 
DB_CONFIG = dict(
    host=os.environ["DB_HOST"],
    port=os.environ["DB_PORT"],
    dbname=os.environ["DB_NAME"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    sslmode="require"
)
 
@app.route("/")
def index():
    return render_template("index.html", dominio=os.environ.get("DOMINIO", ""))
 
@app.route("/api/ubicacion")
def ubicacion():
    conexion = psycopg2.connect(**DB_CONFIG)
    cursor = conexion.cursor()
    cursor.execute("""
        SELECT latitud, longitud, fecha, hora
        FROM ubicaciones
        WHERE propietario = %s
        ORDER BY id DESC
        LIMIT 1
    """, (PROPIETARIO,))
    resultado = cursor.fetchone()
    cursor.close()
    conexion.close()
 
    if resultado:
        respuesta = {
            "latitud": resultado[0],
            "longitud": resultado[1],
            "fecha": resultado[2],
            "hora": resultado[3]
        }
    else:
        respuesta = {"latitud": None, "longitud": None, "fecha": None, "hora": None}
 
    return jsonify(respuesta)
 
@app.route("/api/recorrido")
def recorrido():
    hoy = (datetime.utcnow() - timedelta(hours=5)).strftime("%d/%m/%Y")
    conexion = psycopg2.connect(**DB_CONFIG)
    cursor = conexion.cursor()
    cursor.execute("""
        SELECT latitud, longitud, fecha, hora
        FROM (
            SELECT latitud, longitud, fecha, hora, id
            FROM ubicaciones
            WHERE propietario = %s AND fecha = %s
            ORDER BY id DESC
            LIMIT 500
        ) sub
        ORDER BY id ASC
    """, (PROPIETARIO, hoy))
    filas = cursor.fetchall()
    cursor.close()
    conexion.close()
 
    puntos = [
        {"latitud": f[0], "longitud": f[1], "fecha": f[2], "hora": f[3]}
        for f in filas
    ]
    return jsonify(puntos)
 
@app.route("/api/historico")
def historico():
    inicio = request.args.get("inicio")
    fin = request.args.get("fin")
 
    if not inicio or not fin:
        return jsonify({"error": "Debes especificar inicio y fin"}), 400
 
    inicio_sql = inicio.replace("T", " ") + ":00"
    fin_sql = fin.replace("T", " ") + ":00"
 
    conexion = psycopg2.connect(**DB_CONFIG)
    cursor = conexion.cursor()
    cursor.execute("""
        SELECT latitud, longitud, fecha, hora
        FROM ubicaciones
        WHERE propietario = %s
        AND TO_TIMESTAMP(fecha || ' ' || hora, 'DD/MM/YYYY HH24:MI:SS')
            BETWEEN %s::timestamp AND %s::timestamp
        ORDER BY id ASC
    """, (PROPIETARIO, inicio_sql, fin_sql))
    filas = cursor.fetchall()
    cursor.close()
    conexion.close()
 
    puntos = [
        {"latitud": f[0], "longitud": f[1], "fecha": f[2], "hora": f[3]}
        for f in filas
    ]
    return jsonify(puntos)
 
MINUTOS_ENTRE_PASADAS = 5
RADIO_MINIMO = 10
RADIO_MAXIMO = 1000
 
def leer_fecha(texto):
    try:
        return datetime.strptime(texto, "%Y-%m-%dT%H:%M")
    except (TypeError, ValueError):
        return None
 
@app.route("/api/pasadas")
def pasadas():
    try:
        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
        radio = float(request.args.get("radio", 100))
    except (TypeError, ValueError):
        return jsonify({"error": "Debes especificar lat, lon y radio como números"}), 400
 
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Coordenadas fuera de rango"}), 400
    radio = max(RADIO_MINIMO, min(radio, RADIO_MAXIMO))
 
    inicio_txt = request.args.get("inicio")
    fin_txt = request.args.get("fin")
    inicio = leer_fecha(inicio_txt) if inicio_txt else datetime(2000, 1, 1)
    fin = leer_fecha(fin_txt) if fin_txt else datetime(2100, 1, 1)
    if inicio is None or fin is None:
        return jsonify({"error": "Formato de fecha inválido, usa AAAA-MM-DDTHH:MM"}), 400
    if fin_txt:
        fin = fin + timedelta(seconds=59)
 
    delta_lat = radio / 111000
    delta_lon = radio / (111000 * max(math.cos(math.radians(lat)), 0.01))
 
    conexion = psycopg2.connect(**DB_CONFIG)
    cursor = conexion.cursor()
    cursor.execute("""
        SELECT latitud, longitud, fecha, hora, distancia, momento
        FROM (
            SELECT id, latitud, longitud, fecha, hora,
                TO_TIMESTAMP(fecha || ' ' || hora, 'DD/MM/YYYY HH24:MI:SS')::timestamp AS momento,
                6371000 * 2 * ASIN(SQRT(
                    POWER(SIN(RADIANS(latitud - %(lat)s) / 2), 2) +
                    COS(RADIANS(%(lat)s)) * COS(RADIANS(latitud)) *
                    POWER(SIN(RADIANS(longitud - %(lon)s) / 2), 2)
                )) AS distancia
            FROM ubicaciones
            WHERE propietario = %(propietario)s
            AND latitud BETWEEN %(lat_min)s AND %(lat_max)s
            AND longitud BETWEEN %(lon_min)s AND %(lon_max)s
        ) sub
        WHERE distancia <= %(radio)s
        AND momento BETWEEN %(inicio)s AND %(fin)s
        ORDER BY momento ASC, id ASC
        LIMIT 5000
    """, {
        "lat": lat, "lon": lon, "radio": radio,
        "propietario": PROPIETARIO,
        "lat_min": lat - delta_lat, "lat_max": lat + delta_lat,
        "lon_min": lon - delta_lon, "lon_max": lon + delta_lon,
        "inicio": inicio, "fin": fin
    })
    filas = cursor.fetchall()
    cursor.close()
    conexion.close()
 
    grupos = []
    for f in filas:
        punto = {"latitud": f[0], "longitud": f[1], "fecha": f[2], "hora": f[3]}
        distancia = f[4]
        momento = f[5]
        separado = grupos and momento - grupos[-1]["ultimo"] > timedelta(minutes=MINUTOS_ENTRE_PASADAS)
        if not grupos or separado:
            grupos.append({"puntos": [], "primero": momento, "ultimo": momento, "distancia": distancia})
        grupo = grupos[-1]
        grupo["puntos"].append(punto)
        grupo["ultimo"] = momento
        grupo["distancia"] = min(grupo["distancia"], distancia)
 
    lista_pasadas = [
        {
            "entrada": {"fecha": g["puntos"][0]["fecha"], "hora": g["puntos"][0]["hora"]},
            "salida": {"fecha": g["puntos"][-1]["fecha"], "hora": g["puntos"][-1]["hora"]},
            "minutos": round((g["ultimo"] - g["primero"]).total_seconds() / 60, 1),
            "distancia_minima": round(g["distancia"]),
            "puntos": g["puntos"]
        }
        for g in grupos
    ]
    return jsonify({"radio": radio, "total_puntos": len(filas), "pasadas": lista_pasadas})
 
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)