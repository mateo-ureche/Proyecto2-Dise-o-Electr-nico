import socket
import psycopg2
from dotenv import load_dotenv
import os

load_dotenv()

IP = "0.0.0.0"
PUERTO = 5000
PROPIETARIO = os.environ.get("DOMINIO", "desconocido")

DB_CONFIG = dict(
    host=os.environ["DB_HOST"],
    port=os.environ["DB_PORT"],
    dbname=os.environ["DB_NAME"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    sslmode="require"
)

socket_udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
socket_udp.bind((IP, PUERTO))

print(f"Servidor UDP escuchando en el puerto {PUERTO}... (propietario: {PROPIETARIO})")

while True:
    datos, direccion = socket_udp.recvfrom(1024)
    mensaje = datos.decode("utf-8").strip()

    print(f"Recibido de {direccion}: {mensaje}")

    partes = mensaje.split(";")

    if len(partes) in (4, 5) and partes[0] == "UBICACION":
        fecha_hora, latitud, longitud = partes[1], partes[2], partes[3]
        vehiculo = partes[4].strip() if len(partes) == 5 and partes[4].strip() else "1"
        fecha, hora = fecha_hora.split(" ")

        conexion = psycopg2.connect(**DB_CONFIG)
        cursor = conexion.cursor()
        cursor.execute("""
            INSERT INTO ubicaciones (latitud, longitud, fecha, hora, propietario, vehiculo)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (float(latitud), float(longitud), fecha, hora, PROPIETARIO, vehiculo))
        conexion.commit()
        cursor.close()
        conexion.close()

        print(f"Ubicación guardada (vehículo {vehiculo}).")
    else:
        print("Formato de mensaje incorrecto.")