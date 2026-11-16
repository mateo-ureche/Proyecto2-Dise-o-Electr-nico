import io
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from picamera2 import Picamera2
from picamera2.encoders import JpegEncoder
from picamera2.outputs import FileOutput

PUERTO = 8080
ANCHO = 640
ALTO = 480


class Salida(io.BufferedIOBase):
    def __init__(self):
        self.jpg = None
        self.aviso = threading.Condition()

    def write(self, datos):
        with self.aviso:
            self.jpg = datos
            self.aviso.notify_all()


class Video(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/video":
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=cuadro")
        self.end_headers()
        print(f"Conectado: {self.client_address[0]}")
        try:
            while True:
                with salida.aviso:
                    salida.aviso.wait()
                    jpg = salida.jpg
                self.wfile.write(b"--cuadro\r\nContent-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(jpg)}\r\n\r\n".encode())
                self.wfile.write(jpg + b"\r\n")
        except (BrokenPipeError, ConnectionResetError):
            print(f"Desconectado: {self.client_address[0]}")

    def log_message(self, *args):
        pass


camara = Picamera2()
camara.configure(camara.create_video_configuration(main={"size": (ANCHO, ALTO)}))
salida = Salida()
camara.start_recording(JpegEncoder(q=80), FileOutput(salida))
print(f"Cámara de la Pi lista en: http://localhost:{PUERTO}/video")
print("Ctrl+C para salir.")
try:
    servidor = ThreadingHTTPServer(("0.0.0.0", PUERTO), Video)
    servidor.daemon_threads = True
    servidor.serve_forever()
except KeyboardInterrupt:
    print("Listo.")
finally:
    camara.stop_recording()
