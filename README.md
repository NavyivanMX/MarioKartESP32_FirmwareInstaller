# MarioKart ESP32 RC — Firmware Installer

Instalador web para los firmwares del proyecto **MarioKart ESP32 RC**.

La página utiliza **Web Serial** y **esptool-js** para programar el ESP32 directamente desde Chrome/Edge.

## Funciones

- Selección de Receiver o Transmitter.
- Detección del chip ESP32.
- Lectura de la MAC física del ESP32 mediante esptool-js.
- En Receiver: muestra la MAC para poder utilizarla en el Transmitter.
- En Transmitter: permite configurar la MAC personalizada del Receiver mediante los comandos `MKCFG` del firmware.
- La MAC del Receiver queda almacenada en NVS del Transmitter.
- Guía rápida de conexiones del Receiver.
- Guía del Rumble/Haptic.
- Estructura preparada para publicar el APK Android.

## Firmware

Configuración utilizada por el proyecto:

- ESP32 Dev Module
- Flash: 4 MB
- Flash mode: QIO
- Flash frequency: 80 MHz
- Partition Scheme: Huge APP (3 MB APP / 1 MB SPIFFS)

Los BIN combinados se colocan en:

```text
firmware/release/receiver/receiver_merged.bin
firmware/release/transmitter/transmitter_merged.bin
```

## Configuración del Transmitter

Después de instalar el firmware del Transmitter, el instalador envía:

```text
MKCFG SET AA:BB:CC:DD:EE:FF
```

El firmware guarda la MAC en NVS y responde con `MKCFG OK`.

La aplicación también puede consultar:

```text
MKCFG GET
```

y limpiar la configuración mediante:

```text
MKCFG CLEAR
```

El firmware actual requiere reinicio del Transmitter para activar una nueva MAC personalizada.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub.
2. Sube todo el contenido del proyecto.
3. Ve a `Settings -> Pages`.
4. Selecciona `Deploy from a branch`.
5. Selecciona la rama principal y la carpeta `/root`.
6. Guarda.

La página debe servirse por HTTPS para utilizar Web Serial.

## Navegador

Utiliza una versión actual de Google Chrome o Microsoft Edge en escritorio.

## APK Android

Cuando tengas el APK, publica el archivo en GitHub Releases y coloca su URL en `CONFIG.apkUrl` dentro de `assets/app.js`.

## Importante

- `eraseAll` permanece en `false`, por lo que la configuración NVS del Transmitter no se borra durante una instalación normal.
- Antes de publicar un firmware como versión oficial, prueba el BIN combinado en un ESP32 de laboratorio.
- Los GPIO documentados en la guía deben corresponder a la revisión actual del firmware/hardware.

## Referencias

- Espressif esptool-js
- Espressif esptool / merge-bin
