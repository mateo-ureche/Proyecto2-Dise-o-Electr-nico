package com.example.gpstracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Tasks
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.InputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class UbicacionService : Service() {

    companion object {
        private const val CHANNEL_ID = "gps_tracker_channel"
        private const val NOTIF_ID = 1
        private const val UDP_PORT = 5000
        private const val INTERVALO_MS = 10_000L
        private const val PUERTO_DISPOSITIVO = 6000
        private const val PUERTO_EVENTOS = 5001
        private const val MAXIMO_IMAGEN = 2_000_000
    }

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private val handler = Handler(Looper.getMainLooper())
    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.IO + job)
    private var servidorEventos: ServerSocket? = null
    private var escuchando = false

    private val envioAutomatico = object : Runnable {
        override fun run() {
            intentarEnviar()
            handler.postDelayed(this, INTERVALO_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        crearCanalNotificacion()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIF_ID, construirNotificacion())
        handler.post(envioAutomatico)
        if (!escuchando) {
            escuchando = true
            scope.launch { escucharDispositivo() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(envioAutomatico)
        servidorEventos?.close()
        job.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun crearCanalNotificacion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val canal = NotificationChannel(
                CHANNEL_ID, "GPS Tracker", NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
        }
    }

    private fun construirNotificacion(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("GPS Tracker activo")
            .setContentText("Enviando ubicación cada 10 segundos")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()
    }

    private fun intentarEnviar() {
        val prefs = getSharedPreferences("gps_tracker_prefs", MODE_PRIVATE)
        val ips = listOf(
            prefs.getString("ip1", "") ?: "",
            prefs.getString("ip2", "") ?: "",
            prefs.getString("ip3", "") ?: ""
        ).filter { it.isNotEmpty() }

        if (ips.isEmpty()) return
        if (ActivityCompat.checkSelfPermission(this,
                android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return

        fusedLocationClient.lastLocation.addOnSuccessListener { location ->
            if (location != null) {
                val fechaHora = formatearFecha(location.time)
                val mensaje = "UBICACION;$fechaHora;${location.latitude};${location.longitude}"
                scope.launch {
                    for (ip in ips) enviarUDP(ip, UDP_PORT, mensaje)
                }
            }
        }
    }

    private fun formatearFecha(timestamp: Long): String {
        val formato = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault())
        return formato.format(Date(timestamp))
    }

    private fun enviarUDP(ip: String, puerto: Int, mensaje: String) {
        try {
            val socket = DatagramSocket()
            socket.soTimeout = 3000
            val direccion = InetAddress.getByName(ip)
            val datos = mensaje.toByteArray()
            socket.send(DatagramPacket(datos, datos.size, direccion, puerto))
            socket.close()
        } catch (e: Exception) {
            // El servicio no tiene pantalla propia para mostrar errores
        }
    }

    private fun escucharDispositivo() {
        try {
            val servidor = ServerSocket(PUERTO_DISPOSITIVO)
            servidorEventos = servidor
            while (!servidor.isClosed) {
                val cliente = servidor.accept()
                scope.launch { atenderDispositivo(cliente) }
            }
        } catch (e: Exception) {
            escuchando = false
        }
    }

    private fun atenderDispositivo(cliente: Socket) {
        cliente.use {
            try {
                cliente.soTimeout = 15_000
                val entrada = cliente.getInputStream()
                val partes = leerLinea(entrada).split(";")
                if (partes.size != 5 || partes[0] != "EVENTO") throw IllegalArgumentException()
                val tamano = partes[4].toInt()
                if (tamano > MAXIMO_IMAGEN) throw IllegalArgumentException()
                val imagen = leerBytes(entrada, tamano)

                val location = obtenerUbicacion()
                val latitud = location?.latitude ?: 0.0
                val longitud = location?.longitude ?: 0.0
                val encabezado = "EVENTO;${partes[1]};${partes[2]};${partes[3]};$latitud;$longitud;$tamano\n"

                val ips = leerIps()
                val enviados = ips.count { ip -> enviarEvento(ip, encabezado, imagen) }
                val respuesta = if (enviados > 0) "OK $enviados/${ips.size}\n" else "ERROR\n"
                cliente.getOutputStream().write(respuesta.toByteArray())
            } catch (e: Exception) {
                runCatching { cliente.getOutputStream().write("ERROR\n".toByteArray()) }
            }
        }
    }

    private fun leerIps(): List<String> {
        val prefs = getSharedPreferences("gps_tracker_prefs", MODE_PRIVATE)
        return listOf(
            prefs.getString("ip1", "") ?: "",
            prefs.getString("ip2", "") ?: "",
            prefs.getString("ip3", "") ?: ""
        ).filter { it.isNotEmpty() }
    }

    private fun obtenerUbicacion(): android.location.Location? {
        if (ActivityCompat.checkSelfPermission(this,
                android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null
        return try {
            Tasks.await(fusedLocationClient.lastLocation)
        } catch (e: Exception) {
            null
        }
    }

    private fun leerLinea(entrada: InputStream): String {
        val texto = StringBuilder()
        while (true) {
            val byte = entrada.read()
            if (byte == -1 || byte == '\n'.code) break
            texto.append(byte.toChar())
            if (texto.length > 500) throw IllegalArgumentException()
        }
        return texto.toString().trim()
    }

    private fun leerBytes(entrada: InputStream, tamano: Int): ByteArray {
        val datos = ByteArray(tamano)
        var leidos = 0
        while (leidos < tamano) {
            val n = entrada.read(datos, leidos, tamano - leidos)
            if (n == -1) throw IllegalArgumentException()
            leidos += n
        }
        return datos
    }

    private fun enviarEvento(ip: String, encabezado: String, imagen: ByteArray): Boolean {
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(ip, PUERTO_EVENTOS), 5000)
                socket.soTimeout = 10_000
                val salida = socket.getOutputStream()
                salida.write(encabezado.toByteArray())
                salida.write(imagen)
                salida.flush()
                leerLinea(socket.getInputStream()) == "OK"
            }
        } catch (e: Exception) {
            false
        }
    }
}