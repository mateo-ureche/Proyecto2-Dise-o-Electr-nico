from dotenv import load_dotenv
import psycopg2
import os

load_dotenv()

conexion = psycopg2.connect(
    host=os.environ["DB_HOST"],
    port=os.environ["DB_PORT"],
    dbname=os.environ["DB_NAME"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    sslmode="require"
)

cursor = conexion.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS ubicaciones (
    id SERIAL PRIMARY KEY,
    latitud DOUBLE PRECISION NOT NULL,
    longitud DOUBLE PRECISION NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL
)
""")

conexion.commit()
cursor.close()
conexion.close()

print("Tabla creada correctamente.")
