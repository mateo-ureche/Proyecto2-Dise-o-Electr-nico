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
    desde = request.args.get("desde")  # ej: "2026-09-15T14:00"
    hasta = request.args.get("hasta")  # ej: "2026-09-15T16:00"

    if not desde or not hasta:
        return jsonify({"error": "Faltan los parámetros 'desde' y 'hasta'"}), 400

    try:
        desde_dt = datetime.strptime(desde, "%Y-%m-%dT%H:%M")
        hasta_dt = datetime.strptime(hasta, "%Y-%m-%dT%H:%M")
    except ValueError:
        return jsonify({"error": "Formato de fecha inválido"}), 400

    conexion = psycopg2.connect(**DB_CONFIG)
    cursor = conexion.cursor()
    cursor.execute("""
        SELECT latitud, longitud, fecha, hora
        FROM ubicaciones
        WHERE propietario = %s
          AND to_timestamp(fecha || ' ' || hora, 'DD/MM/YYYY HH24:MI:SS') BETWEEN %s AND %s
        ORDER BY id ASC
        LIMIT 5000
    """, (PROPIETARIO, desde_dt, hasta_dt))
    filas = cursor.fetchall()
    cursor.close()
    conexion.close()

    puntos = [
        {"latitud": f[0], "longitud": f[1], "fecha": f[2], "hora": f[3]}
        for f in filas
    ]
    return jsonify(puntos)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)