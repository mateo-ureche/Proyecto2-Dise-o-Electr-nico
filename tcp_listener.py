import os
import socket
import threading
from datetime import datetime

import psycopg2
from dotenv import load_dotenv

load_dotenv()

IP = "0.0.0.0"
PUERTO = 5001
PROPIETARIO = os.environ.get("DOMINIO", "desconocido")
CARPETA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "eventos")
MAXIMO_IMAGEN = 2_000_000

DB_CONFIG = dict(
    host=os.environ["DB_HOST"],
    port=os.environ["DB_PORT"],
    dbname=os.environ["DB_NAME"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    sslmode="require"
)


def crear_tabla():
    conexion = psycopg2.connect(**DB_CONFIG)
    cursor = conexion.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS eventos (
            id SERIAL PRIMARY KEY,
            tipo TEXT NOT NULL,
            duracion DOUBLE PRECISION,
            fecha TEXT NOT NULL,
            hora TEXT NOT NULL,
            latitud DOUBLE PRECISION,
            longitud DOUBLE PRECISION,
            imagen TEXT,
            propietario TEXT NOT NULL
        )
    """)
    conexion.commit()
    cursor.close()
    conexion.close()


def guardar_evento(tipo, duracion, fecha, hora, latitud, longitud, imagen):
    nombre = f"{PROPIETARIO}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}_{tipo}.jpg"
    with open(os.path.join(CARPETA, nombre), "wb") as archivo:
        archivo.write(imagen)

    conexion = psycopg2.connect(**DB_CONFIG)
    cursor = conexion.cursor()
    cursor.execute("""
        INSERT INTO eventos (tipo, duracion, fecha, hora, latitud, longitud, imagen, propietario)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """, (tipo, duracion, fecha, hora, latitud, longitud, nombre, PROPIETARIO))
    conexion.commit()
    cursor.close()
    conexion.close()


def atender(cliente, direccion):
    with cliente:
        cliente.settimeout(15)
        lector = cliente.makefile("rb")
        try:
            encabezado = lector.readline().decode("utf-8").strip()
            print(f"Recibido de {direccion}: {encabezado}")
            partes = encabezado.split(";")
            if len(partes) != 7 or partes[0] != "EVENTO":
                raise ValueError("formato incorrecto")

            _, tipo, duracion, fecha_hora, latitud, longitud, tamano = partes
            fecha, hora = fecha_hora.split(" ")
            tamano = int(tamano)
            if tamano > MAXIMO_IMAGEN:
                raise ValueError("imagen muy grande")

            imagen = lector.read(tamano)
            if len(imagen) != tamano:
                raise ValueError("imagen incompleta")

            guardar_evento(tipo, float(duracion), fecha, hora, float(latitud), float(longitud), imagen)
            cliente.sendall(b"OK\n")
            print("Evento guardado.")
        except Exception as error:
            print(f"Evento rechazado: {error}")
            cliente.sendall(b"ERROR\n")


os.makedirs(CARPETA, exist_ok=True)
crear_tabla()

socket_tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
socket_tcp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
socket_tcp.bind((IP, PUERTO))
socket_tcp.listen()

print(f"Servidor TCP de eventos escuchando en el puerto {PUERTO}... (propietario: {PROPIETARIO})")

while True:
    cliente, direccion = socket_tcp.accept()
    threading.Thread(target=atender, args=(cliente, direccion), daemon=True).start()