# MarioKart ESP32 RC — Generar los archivos BIN para el instalador web

El error `No se encontró el firmware: firmware/release/receiver/receiver_merged.bin` significa que el instalador web no encuentra el archivo combinado que debe cargar al ESP32. El ZIP del instalador no incluye los binarios compilados del proyecto; deben generarse desde Arduino IDE.

## Método recomendado: usar el script

### 1. Compila cada firmware en Arduino IDE

Compila el sketch del **Receiver** y después el del **Transmitter**. Para cada uno, en Arduino IDE selecciona:

- Placa: `ESP32 Dev Module` (o la misma placa usada para compilar el proyecto).
- Flash Size: `4MB (32Mb)`.
- Partition Scheme: `Huge APP (3MB No OTA/1MB SPIFFS)`, si esa es la configuración con la que probaste el firmware.
- Flash Mode: `QIO` si tu módulo lo admite.
- Flash Frequency: `80MHz`.

En Arduino IDE activa **Mostrar salida detallada durante la compilación** en Preferencias si necesitas localizar la carpeta de compilación. En la salida aparecerá una ruta parecida a:

```text
C:\Users\narci\AppData\Local\arduino\sketches\<identificador>\
```

También puedes usar las carpetas que ya tienes, si contienen los cuatro archivos necesarios.

### 2. Instala esptool si hace falta

Abre CMD o PowerShell y ejecuta:

```bat
py -m pip install --upgrade esptool
```

Si el comando `py` no existe, instala Python para Windows y activa la opción de agregarlo al PATH. El script intenta usar `esptool` desde PATH o `py -m esptool` / `python -m esptool`.

### 3. Ejecuta el generador

Desde el Explorador de archivos, entra a:

```text
MarioKartESP32_FirmwareInstaller\tools\
```

Haz doble clic en:

```text
generar-bin.bat
```

Cuando lo solicite, pega la ruta completa de la carpeta `build` del Receiver y después la del Transmitter. Usa Enter para omitir un firmware que no quieras generar en esa ejecución.

Ejemplo para Receiver, con la ruta que has usado anteriormente:

```text
C:\Users\narci\Documents\Arduino\MarioKartESP32\Receiver\build\esp32.esp32.esp32
```

Para el Transmitter, pega la carpeta `build` correspondiente a su sketch. Las rutas pueden variar según la versión de Arduino IDE; usa la ruta real que aparece en tu equipo.

El script busca automáticamente estos archivos dentro de cada carpeta:

- `*.bootloader.bin`
- `*.partitions.bin`
- `boot_app0.bin`
- `*.ino.bin` (firmware principal)

Luego ejecuta `esptool merge-bin` con las direcciones de memoria correctas y crea los binarios combinados en las rutas que espera la página web.

### 4. Verifica que se hayan creado los archivos

La estructura final debe quedar así:

```text
MarioKartESP32_FirmwareInstaller/
└── firmware/
    └── release/
        ├── receiver/
        │   └── receiver_merged.bin
        └── transmitter/
            └── transmitter_merged.bin
```

Los nombres deben ser exactamente `receiver_merged.bin` y `transmitter_merged.bin`. No basta con copiar `Receiver.ino.bin` o `Transmitter.ino.bin`: esos son solo el firmware de la aplicación y no incluyen todas las partes necesarias para flashear desde la dirección `0x0`.

## Método manual con esptool

Si prefieres usar los comandos manuales, abre CMD/PowerShell y ajusta las rutas a los archivos que realmente existan en tu equipo.

### Receiver

```powershell
py -m esptool --chip esp32 merge-bin `
  -o "C:\Users\narci\Documents\Arduino\MarioKartESP32_FirmwareInstaller\firmware\release\receiver\receiver_merged.bin" `
  --flash-mode qio `
  --flash-freq 80m `
  --flash-size 4MB `
  0x1000 "C:\Users\narci\Documents\Arduino\MarioKartESP32\Receiver\build\esp32.esp32.esp32\Receiver.ino.bootloader.bin" `
  0x8000 "C:\Users\narci\Documents\Arduino\MarioKartESP32\Receiver\build\esp32.esp32.esp32\Receiver.ino.partitions.bin" `
  0xE000 "C:\Users\narci\Documents\Arduino\MarioKartESP32\Receiver\build\esp32.esp32.esp32\boot_app0.bin" `
  0x10000 "C:\Users\narci\Documents\Arduino\MarioKartESP32\Receiver\build\esp32.esp32.esp32\Receiver.ino.bin"
```

### Transmitter

Reemplaza las rutas siguientes por la carpeta real de compilación del Transmitter y confirma los nombres de archivo:

```powershell
py -m esptool --chip esp32 merge-bin `
  -o "C:\Users\narci\Documents\Arduino\MarioKartESP32_FirmwareInstaller\firmware\release\transmitter\transmitter_merged.bin" `
  --flash-mode qio `
  --flash-freq 80m `
  --flash-size 4MB `
  0x1000 "RUTA_BUILD_TRANSMITTER\Transmitter.ino.bootloader.bin" `
  0x8000 "RUTA_BUILD_TRANSMITTER\Transmitter.ino.partitions.bin" `
  0xE000 "RUTA_BUILD_TRANSMITTER\boot_app0.bin" `
  0x10000 "RUTA_BUILD_TRANSMITTER\Transmitter.ino.bin"
```

En PowerShell, el carácter de continuación es la tilde invertida `` ` `` al final de la línea, no una comilla simple. También puedes pegar todo el comando en una sola línea.

## Si el script dice que falta un archivo

1. Vuelve a compilar ese sketch en Arduino IDE.
2. Busca la carpeta de compilación real en la salida detallada.
3. Comprueba que contiene el bootloader, las particiones, `boot_app0.bin` y el archivo principal `.ino.bin`.
4. Ejecuta de nuevo `generar-bin.bat`.

Si el nombre del sketch no es `Receiver.ino` o `Transmitter.ino`, no pasa nada: el script selecciona el archivo `*.ino.bin` principal disponible en la carpeta.

## Publicar o probar la página

Después de generar los BIN:

1. Confirma que ambos archivos están en las rutas indicadas.
2. Sube al repositorio de GitHub las carpetas `firmware/release/receiver/` y `firmware/release/transmitter/` con sus archivos `.bin`.
3. Espera a que GitHub Pages publique los cambios y recarga la página con `Ctrl+F5`.
4. Prueba primero el Receiver y luego el Transmitter en un ESP32 de laboratorio.

## Importante

- No cambies las direcciones `0x1000`, `0x8000`, `0xE000` y `0x10000` si mantienes la configuración habitual de Arduino ESP32 descrita aquí.
- La configuración `QIO`, `80 MHz`, `4MB` y el esquema de particiones deben coincidir con los usados al compilar/probar el firmware.
- La instalación normal del navegador debe conservar `eraseAll: false` para no borrar la configuración NVS guardada (por ejemplo, la MAC personalizada).
- No incluyas credenciales o archivos privados en el repositorio.


Pasos:

Compila los dos proyectos
En Arduino IDE, compila primero el Receiver y después el Transmitter. Debes conservar los archivos generados durante la compilación.

Para tu Receiver, la carpeta que habías utilizado es:
C:\Users\narci\Documents\Arduino\MarioKartESP32\Receiver\build\esp32.esp32.esp32
Para tu Receiver, la carpeta que habías utilizado es:
C:\Users\narci\Documents\Arduino\MarioKartESP32\Transmitter\build\esp32.p32.esp32

Ejecuta el generador
Abre la carpeta tools y ejecuta:

generar-bin.bat

El script te pedirá las rutas de las carpetas de compilación. Puedes generar solo el Receiver, solo el Transmitter o ambos
C:\Users\narci\Documents\Arduino\MarioKartESP32\Receiver\build\esp32.esp32.esp32
C:\Users\narci\Documents\Arduino\MarioKartESP32\Transmitter\build\esp32.p32.esp32


Si Windows no encuentra esptool, abre una terminal y ejecuta:
py -m pip install --upgrade esptool