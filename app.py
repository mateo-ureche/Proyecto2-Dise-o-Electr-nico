from flask import Flask, jsonify, render_template
from dotenv import load_dotenv
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
