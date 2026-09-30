from flask import Flask, jsonify, render_template, request
from dotenv import load_dotenv
from datetime import datetime, timedelta
import psycopg2
import os

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

def leer_fecha(texto, por_defecto):
    return datetime.strptime(texto, "%Y-%m-%dT%H:%M") if texto else por_defecto

@app.route("/api/pasadas")
def pasadas():
    try:
        lat = float(request.args["lat"])
        lon = float(request.args["lon"])
        radio = min(float(request.args.get("radio", 30)), 1000)
        inicio = leer_fecha(request.args.get("inicio"), datetime(2000, 1, 1))
        fin = leer_fecha(request.args.get("fin"), datetime(2100, 1, 1)) + timedelta(seconds=59)
    except (KeyError, ValueError):
        return jsonify({"error": "Parámetros inválidos"}), 400

    conexion = psycopg2.connect(**DB_CONFIG)
    cursor = conexion.cursor()
    cursor.execute("""
        SELECT fecha, hora, momento FROM (
            SELECT fecha, hora, latitud, longitud,
                TO_TIMESTAMP(fecha || ' ' || hora, 'DD/MM/YYYY HH24:MI:SS')::timestamp AS momento
            FROM ubicaciones WHERE propietario = %(propietario)s
        ) sub
        WHERE momento BETWEEN %(inicio)s AND %(fin)s
        AND 6371000 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(latitud - %(lat)s) / 2), 2) +
            COS(RADIANS(%(lat)s)) * COS(RADIANS(latitud)) * POWER(SIN(RADIANS(longitud - %(lon)s) / 2), 2)
        )) <= %(radio)s
        ORDER BY momento
    """, {"propietario": PROPIETARIO, "lat": lat, "lon": lon, "radio": radio, "inicio": inicio, "fin": fin})
    filas = cursor.fetchall()
    cursor.close()
    conexion.close()

    lista = []
    for fecha, hora, momento in filas:
        if lista and momento - ultimo <= timedelta(minutes=5):
            lista[-1]["salida"] = {"fecha": fecha, "hora": hora}
            lista[-1]["minutos"] = round((momento - primero).total_seconds() / 60, 1)
        else:
            primero = momento
            lista.append({"entrada": {"fecha": fecha, "hora": hora}, "salida": {"fecha": fecha, "hora": hora}, "minutos": 0})
        ultimo = momento
    return jsonify({"pasadas": lista})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)