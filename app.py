from flask import Flask, jsonify, send_from_directory
from dotenv import load_dotenv
import psycopg2
import os

load_dotenv()

app = Flask(__name__, static_folder="web", static_url_path="")

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
    return send_from_directory("web", "index.html")

@app.route("/api/ubicacion")
def ubicacion():
    conexion = psycopg2.connect(**DB_CONFIG)
    cursor = conexion.cursor()
    cursor.execute("""
        SELECT latitud, longitud, fecha, hora
        FROM ubicaciones
        ORDER BY id DESC
        LIMIT 1
    """)
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
