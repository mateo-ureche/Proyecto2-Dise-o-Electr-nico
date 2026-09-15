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
    
    # CAMBIO 1: Pedimos los últimos 50 registros en lugar de 1
    cursor.execute("""
        SELECT latitud, longitud, fecha, hora
        FROM ubicaciones
        WHERE propietario = %s
        ORDER BY id DESC
        LIMIT 50
    """, (PROPIETARIO,))
    
    resultados = cursor.fetchall()
    cursor.close()
    conexion.close()

    # CAMBIO 2: Guardamos todos los puntos en una lista (invertida para dibujar la ruta en orden)
    historial = []
    if resultados:
        for fila in reversed(resultados):
            historial.append({
                "latitud": fila[0],
                "longitud": fila[1],
                "fecha": fila[2],
                "hora": fila[3]
            })

    # Ahora enviamos la lista completa al frontend
    return jsonify(historial)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
