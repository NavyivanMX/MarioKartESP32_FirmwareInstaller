import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.7.0/bundle.js";

const CONFIG = {
  receiver: {
    name: "Receiver",
    version: "1.0.0",
    bin: "firmware/release/receiver/receiver_merged.bin"
  },
  transmitter: {
    name: "Transmitter",
    version: "1.1.0 RC1.1",
    bin: "firmware/release/transmitter/transmitter_merged.bin"
  },
  apkUrl: ""
};

let selectedFirmware = "receiver";
let port = null;
let transport = null;
let esploader = null;
let connected = false;
let detectedMac = "";
let firmwareInstalled = false;

const $ = (id) => document.getElementById(id);

const log = (msg) => {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  $("log").textContent += line + "\n";
  $("log").scrollTop = $("log").scrollHeight;
};

function setStatus(msg) {
  $("status").textContent = msg;
  log(msg);
}

function setProgress(percent) {
  const p = Math.max(0, Math.min(100, percent));
  $("progressBar").style.width = `${p}%`;
  $("progressText").textContent = `${p.toFixed(0)}%`;
}

function normalizeMac(value) {
  return value.trim().toUpperCase().replace(/-/g, ":");
}

function isValidMac(value) {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalizeMac(value));
}

function setMacValidation() {
  const input = $("customMacInput");
  const value = normalizeMac(input.value);
  input.value = value;

  if (!value) {
    $("macValidation").textContent = "";
    $("macValidation").className = "field-message";
    $("saveMacButton").disabled = true;
    return false;
  }

  if (!isValidMac(value)) {
    $("macValidation").textContent = "Formato esperado: AA:BB:CC:DD:EE:FF";
    $("macValidation").className = "field-message error";
    $("saveMacButton").disabled = true;
    return false;
  }

  $("macValidation").textContent = "✓ MAC válida.";
  $("macValidation").className = "field-message success";
  $("saveMacButton").disabled = !connected || !firmwareInstalled;
  return true;
}

function selectFirmware(kind) {
  selectedFirmware = kind;
  firmwareInstalled = false;

  document.querySelectorAll(".firmware-card").forEach(button =>
    button.classList.toggle("active", button.dataset.firmware === kind)
  );

  const cfg = CONFIG[kind];
  $("firmwareVersion").textContent = `Firmware: ${cfg.name} · versión ${cfg.version}`;

  $("receiverMacPanel").classList.toggle("hidden", kind !== "receiver");
  $("receiverLedConfigPanel").classList.toggle("hidden", kind !== "receiver");
  $("transmitterConfigPanel").classList.toggle("hidden", kind !== "transmitter");
  $("saveLedCountsButton").disabled = !(connected && firmwareInstalled && kind === "receiver");
  $("ledConfigStatus").textContent = "Instala primero el firmware del Receiver para consultar o guardar la configuración.";
  $("ledConfigStatus").className = "status compact";
  $("installHint").textContent = kind === "receiver"
    ? "Instala el firmware y conserva la MAC mostrada para configurar después el Transmitter."
    : "Primero instala el firmware. Después podrás guardar la MAC del Receiver en la memoria NVS del Transmitter.";

  $("macSaveStatus").textContent = "La MAC se configurará después de instalar el firmware.";
  $("macSaveStatus").className = "status compact";
  setMacValidation();

  setStatus(`Firmware seleccionado: ${cfg.name}.`);
}

async function readChipMac() {
  if (!esploader || !esploader.chip || typeof esploader.chip.readMac !== "function") {
    throw new Error("La versión de esptool-js no permite leer la MAC del chip.");
  }

  const mac = await esploader.chip.readMac(esploader);
  return normalizeMac(mac);
}

async function connectESP32() {
  if (!("serial" in navigator)) {
    setStatus("Este navegador no soporta Web Serial. Usa Chrome o Edge en escritorio.");
    return;
  }

  try {
    setStatus("Selecciona el puerto serial del ESP32...");
    port = await navigator.serial.requestPort();

    transport = new Transport(port, true);

    esploader = new ESPLoader({
      transport,
      baudrate: 115200,
      terminal: {
        clean() {},
        writeLine(data) { log(data); },
        write(data) { log(data); }
      },
      debugLogging: false
    });

    const chipName = await esploader.main();
    detectedMac = await readChipMac();
    connected = true;

    $("deviceInfo").textContent = `ESP32 detectado: ${chipName} · MAC: ${detectedMac}`;
    $("flashButton").disabled = false;

    if (selectedFirmware === "receiver") {
      $("receiverMac").textContent = detectedMac;
      localStorage.setItem("mariokartLastReceiverMac", detectedMac);
    }

    if (selectedFirmware === "transmitter") {
      const savedMac = localStorage.getItem("mariokartReceiverMac") || localStorage.getItem("mariokartLastReceiverMac") || "";
      if (savedMac && !$("customMacInput").value) {
        $("customMacInput").value = savedMac;
        setMacValidation();
      }
    }

    setStatus(`ESP32 conectado correctamente: ${chipName}. MAC: ${detectedMac}`);
  } catch (error) {
    connected = false;
    $("flashButton").disabled = true;
    setStatus(`No fue posible conectar: ${error.message || error}`);
  }
}

async function flashFirmware() {
  if (!connected || !esploader) {
    setStatus("Primero conecta el ESP32.");
    return;
  }

  const cfg = CONFIG[selectedFirmware];

  try {
    $("flashButton").disabled = true;
    $("connectButton").disabled = true;
    $("saveMacButton").disabled = true;
    setProgress(0);
    setStatus(`Descargando ${cfg.name}...`);

    const response = await fetch(cfg.bin, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`No se encontró el firmware: ${cfg.bin}`);
    }

    const data = new Uint8Array(await response.arrayBuffer());
    setStatus(`Instalando ${cfg.name} (${data.length.toLocaleString()} bytes)...`);

    await esploader.writeFlash({
      fileArray: [{ data, address: 0x0 }],
      flashMode: "dio",
      flashFreq: "80m",
      flashSize: "4MB",
      eraseAll: false,
      compress: true,
      reportProgress: (_fileIndex, written, total) => {
        setProgress((written / total) * 100);
      }
    });

    await esploader.after("hard_reset");
    firmwareInstalled = true;
    setProgress(100);

    if (selectedFirmware === "receiver") {
      $("receiverMac").textContent = detectedMac || "MAC no disponible";
      $("receiverMacPanel").classList.remove("hidden");
      setStatus(`✓ Receiver instalado correctamente. MAC: ${detectedMac || "no disponible"}`);
      $("saveLedCountsButton").disabled = false;
      $("ledConfigStatus").textContent = "Firmware instalado. Consultando la configuración LED actual...";
      $("ledConfigStatus").className = "status compact";
      await new Promise(resolve => setTimeout(resolve, 900));
      await tryReadExistingReceiverConfig();
    } else {
      setStatus("✓ Transmitter instalado correctamente. Ahora puedes guardar la MAC del Receiver.");
      setMacValidation();
      await new Promise(resolve => setTimeout(resolve, 900));
      await tryReadExistingTransmitterConfig();
    }
  } catch (error) {
    firmwareInstalled = false;
    setStatus(`Error durante la instalación: ${error.message || error}`);
  } finally {
    $("flashButton").disabled = false;
    $("connectButton").disabled = false;
    setMacValidation();
  }
}

async function closeEspToolTransport() {
  if (transport) {
    try { 
      log(`Serial antes de desconectar: readable=${!!port?.readable}, writable=${!!port?.writable}`);
      await transport.disconnect(); 
      log(`Serial después de desconectar: readable=${!!port?.readable}, writable=${!!port?.writable}`);
    } catch (_) {}
  }
}





async function openApplicationSerial() {
  if (!port) {
    throw new Error("No hay puerto serial conectado.");
  }

  logSerialState("Antes de liberar esptool");

  if (transport) {
    const oldTransport = transport;

    // Evitar reutilizar referencias al transporte anterior.
    transport = null;
    esploader = null;

    try {
      await oldTransport.disconnect();
      log("Transporte de esptool desconectado.");
    } catch (error) {
      log(`Aviso al desconectar esptool: ${error.message || error}`);
    }
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  logSerialState("Después de desconectar esptool");

  if (port.readable !== null && port.writable !== null) {
    log("El puerto sigue abierto; se reutilizará.");
    return;
  }

  if (port.readable === null && port.writable === null) {
    log("Abriendo el puerto para comandos de aplicación...");
    await port.open({ baudRate: 115200 });

    await new Promise(resolve => setTimeout(resolve, 500));

    logSerialState("Puerto abierto para aplicación");
    return;
  }

  throw new Error(
    "El puerto quedó en estado parcial. " +
    `readable=${port.readable !== null}, ` +
    `writable=${port.writable !== null}`
  );
}




function logSerialState(label) {
  if (!port) {
    log(`[SERIAL] ${label}: port=null`);
    return;
  }

  log(
    `[SERIAL] ${label}: ` +
    `readable=${port.readable !== null}, ` +
    `writable=${port.writable !== null}, ` +
    `connected=${port.readable !== null && port.writable !== null}`
  );
}


async function sendApplicationCommand(
  command,
  timeoutMs = 2500,
  completionPredicate = null
) {
  await openApplicationSerial();

  log("Esperando el arranque completo del Receiver...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  log("Fin de espera. Preparando el comando serial.");

  if (!port.readable || !port.writable) {
    throw new Error("El puerto serial no está disponible.");
  }

  // Adquirir primero el lector para no perder una respuesta temprana.
  const reader = port.readable.getReader();
  let writer = null;
  let response = "";
  logSerialState(`Preparado para enviar ${command}`);
log("Adquiriendo lector serial...");
  const decoder = new TextDecoder();
  let pendingRead = null;
  let timedOut = false;

  try {
    writer = port.writable.getWriter();

    // El firmware procesa el comando al recibir LF.
log(`Enviando comando: ${JSON.stringify(command + "\n")}`);

const bytesSent = new TextEncoder().encode(`${command}\n`);
await writer.write(bytesSent);

log(`Bytes enviados: ${bytesSent.length}`);

    writer.releaseLock();
    writer = null;

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();

      pendingRead = reader.read();

      let timerId;
      const result = await Promise.race([
        pendingRead.then(value => ({
          kind: "read",
          value
        })),
        new Promise(resolve => {
          timerId = setTimeout(
            () => resolve({ kind: "timeout" }),
            remaining
          );
        })
      ]);

      clearTimeout(timerId);

if (result.kind === "timeout") {
  timedOut = true;
  log(`Tiempo agotado esperando respuesta a ${command}.`);
  break;
}
      pendingRead = null;

if (result.value.done) {
  log("La lectura serial terminó (done=true).");
  break;
}

const chunk = result.value.value;

log(`Bytes recibidos en bloque: ${chunk.length}`);

response += decoder.decode(chunk, {
  stream: true
});

log(`Respuesta acumulada: ${JSON.stringify(response)}`);

      const normalized = response.replace(/\r/g, "");

      if (
        completionPredicate &&
        completionPredicate(normalized)
      ) {
        break;
      }
    }
  } finally {
    if (writer) {
      try {
        writer.releaseLock();
      } catch (_) {}
    }

    if (timedOut && pendingRead) {
      try {
        await reader.cancel();
      } catch (_) {}

      try {
        await pendingRead;
      } catch (_) {}

      pendingRead = null;
    }

    try {
      reader.releaseLock();
    } catch (_) {}
  }

  response += decoder.decode();

  log(`CMD> ${command}`);

  if (response.trim()) {
    log(`ESP32> ${response.trim()}`);
  } else {
    log("ESP32> (sin respuesta)");
  }

  return response;
}



async function tryReadExistingReceiverConfig() {
  try {
    const response = await sendApplicationCommand(
      "MKCFG GET",
      1800,
      text => text.includes("MKCFG AMBIENT_LEDS=") && text.includes("MKCFG REAR_LEDS=")
    );
    const ambient = response.match(/MKCFG AMBIENT_LEDS=(\d+)/i);
    const rear = response.match(/MKCFG REAR_LEDS=(\d+)/i);

    if (ambient && rear) {
      $("ambientLedCount").value = ambient[1];
      $("rearLedCount").value = rear[1];
      $("ledConfigStatus").textContent = `Configuración actual leída del Receiver: ${ambient[1]} LEDs ambientales y ${rear[1]} LEDs traseros.`;
      $("ledConfigStatus").className = "status compact success-box";
    } else {
      $("ledConfigStatus").textContent = "No se pudo leer la configuración actual. Puedes introducir los valores y guardarlos manualmente.";
      $("ledConfigStatus").className = "status compact error-box";
    }
  } catch (error) {
    log(`No fue posible consultar la configuración LED: ${error.message || error}`);
    $("ledConfigStatus").textContent = "No se pudo consultar la configuración automáticamente. Verifica la conexión serial e intenta guardar los valores manualmente.";
    $("ledConfigStatus").className = "status compact error-box";
  }
}

function validateLedCountInput(input) {
  const value = Number(input.value);
  const valid = Number.isInteger(value) && value >= 1 && value <= 255;
  input.setAttribute("aria-invalid", valid ? "false" : "true");
  $("saveLedCountsButton").disabled = !(valid &&
    Number.isInteger(Number($("ambientLedCount").value)) && Number($("ambientLedCount").value) >= 1 && Number($("ambientLedCount").value) <= 255 &&
    Number.isInteger(Number($("rearLedCount").value)) && Number($("rearLedCount").value) >= 1 && Number($("rearLedCount").value) <= 255 &&
    connected && firmwareInstalled && selectedFirmware === "receiver");
  return valid;
}

async function saveReceiverLedCounts() {
  if (!connected || !firmwareInstalled || selectedFirmware !== "receiver") {
    $("ledConfigStatus").textContent = "Instala primero el firmware del Receiver.";
    $("ledConfigStatus").className = "status compact error-box";
    return;
  }

  const ambient = Number($("ambientLedCount").value);
  const rear = Number($("rearLedCount").value);
  if (!Number.isInteger(ambient) || ambient < 1 || ambient > 255 ||
      !Number.isInteger(rear) || rear < 1 || rear > 255) {
    $("ledConfigStatus").textContent = "Cada cantidad debe ser un número entero entre 1 y 255.";
    $("ledConfigStatus").className = "status compact error-box";
    validateLedCountInput($("ambientLedCount"));
    validateLedCountInput($("rearLedCount"));
    return;
  }

  const button = $("saveLedCountsButton");
  button.disabled = true;
  $("ledConfigStatus").textContent = "Guardando cantidad de LEDs en la memoria NVS del Receiver...";
  $("ledConfigStatus").className = "status compact";

  try {
    const ambientResponse = await sendApplicationCommand(`MKCFG SET AMBIENT_LEDS=${ambient}`, 2200, text => text.includes("MKCFG OK") || text.includes("MKCFG ERROR"));
    if (!ambientResponse.includes("MKCFG OK")) throw new Error("El Receiver no confirmó AMBIENT_LEDS.");

    const rearResponse = await sendApplicationCommand(`MKCFG SET REAR_LEDS=${rear}`, 2200, text => text.includes("MKCFG OK") || text.includes("MKCFG ERROR"));
    if (!rearResponse.includes("MKCFG OK")) throw new Error("El Receiver no confirmó REAR_LEDS.");

    $("ledConfigStatus").textContent = `✓ Guardado: ${ambient} LEDs ambientales y ${rear} LEDs traseros. Reinicia el Receiver para aplicar los cambios.`;
    $("ledConfigStatus").className = "status compact success-box";
    setStatus("✓ Cantidad de LEDs guardada en NVS. Reinicia el Receiver para aplicar la configuración.");
  } catch (error) {
    $("ledConfigStatus").textContent = `Error al guardar: ${error.message || error}`;
    $("ledConfigStatus").className = "status compact error-box";
    setStatus(`No fue posible guardar la cantidad de LEDs: ${error.message || error}`);
  } finally {
    validateLedCountInput($("ambientLedCount"));
    validateLedCountInput($("rearLedCount"));
  }
}

async function tryReadExistingTransmitterConfig() {
  try {
    const response = await sendApplicationCommand("MKCFG GET", 1500, text => text.includes("MKCFG CUSTOM_MAC="));
    const match = response.match(/MKCFG CUSTOM_MAC=([0-9A-Fa-f:]{17}|NONE)/);
    if (!match) return;

    if (match[1] !== "NONE") {
      $("customMacInput").value = normalizeMac(match[1]);
      localStorage.setItem("mariokartReceiverMac", normalizeMac(match[1]));
      $("macSaveStatus").textContent = `MAC existente en NVS: ${normalizeMac(match[1])}`;
      $("macSaveStatus").className = "status compact success-box";
      setMacValidation();
    }
  } catch (error) {
    log(`No fue posible consultar MKCFG GET todavía: ${error.message || error}`);
  }
}

async function saveTransmitterMac() {
  if (!connected || !firmwareInstalled) {
    $("macSaveStatus").textContent = "Instala primero el firmware del Transmitter.";
    $("macSaveStatus").className = "status compact error-box";
    return;
  }

  const mac = normalizeMac($("customMacInput").value);
  if (!isValidMac(mac)) {
    setMacValidation();
    return;
  }

  try {
    $("saveMacButton").disabled = true;
    $("macSaveStatus").textContent = "Guardando MAC en NVS...";
    $("macSaveStatus").className = "status compact";

    const response = await sendApplicationCommand(`MKCFG SET ${mac}`, 2200);

    if (!response.includes("MKCFG OK")) {
      throw new Error("El Transmitter no confirmó la configuración.");
    }

    localStorage.setItem("mariokartReceiverMac", mac);
    $("macSaveStatus").textContent = `✓ MAC guardada: ${mac}. Reinicia el Transmitter para activar la nueva configuración.`;
    $("macSaveStatus").className = "status compact success-box";
    setStatus("✓ Configuración guardada en NVS. El Transmitter requiere reinicio para activar la nueva MAC.");
  } catch (error) {
    $("macSaveStatus").textContent = `Error: ${error.message || error}`;
    $("macSaveStatus").className = "status compact error-box";
    setStatus(`No fue posible guardar la MAC: ${error.message || error}`);
  } finally {
    setMacValidation();
  }
}

async function copyReceiverMac() {
  const mac = $("receiverMac").textContent;
  if (!isValidMac(mac)) return;

  try {
    await navigator.clipboard.writeText(mac);
    localStorage.setItem("mariokartReceiverMac", mac);
    $("copyMacButton").textContent = "✓ Copiada";
    setTimeout(() => $("copyMacButton").textContent = "📋 Copiar MAC", 1500);
  } catch (_) {
    setStatus("No fue posible copiar la MAC automáticamente.");
  }
}

document.querySelectorAll(".firmware-card").forEach(button => {
  button.addEventListener("click", () => selectFirmware(button.dataset.firmware));
});

document.querySelectorAll(".guide-tab").forEach(button => {
  button.addEventListener("click", () => {
    const guide = button.dataset.guide;
    document.querySelectorAll(".guide-tab").forEach(b => b.classList.toggle("active", b === button));
    $("guideReceiver").classList.toggle("active", guide === "receiver");
    $("guideTransmitter").classList.toggle("active", guide === "transmitter");
  });
});

$("connectButton").addEventListener("click", connectESP32);
$("flashButton").addEventListener("click", flashFirmware);
$("customMacInput").addEventListener("input", setMacValidation);
$("saveMacButton").addEventListener("click", saveTransmitterMac);
$("clearMacButton").addEventListener("click", () => {
  $("customMacInput").value = "";
  setMacValidation();
});
$("copyMacButton").addEventListener("click", copyReceiverMac);
$("saveLedCountsButton").addEventListener("click", saveReceiverLedCounts);
$("ambientLedCount").addEventListener("input", () => validateLedCountInput($("ambientLedCount")));
$("rearLedCount").addEventListener("input", () => validateLedCountInput($("rearLedCount")));

if (CONFIG.apkUrl) {
  $("apkButton").href = CONFIG.apkUrl;
  $("apkButton").classList.remove("disabled");
  $("apkButton").removeAttribute("aria-disabled");
}

const rememberedReceiverMac = localStorage.getItem("mariokartReceiverMac") || localStorage.getItem("mariokartLastReceiverMac") || "";
if (rememberedReceiverMac) $("customMacInput").value = rememberedReceiverMac;

selectFirmware("receiver");

if (!("serial" in navigator)) {
  setStatus("Web Serial no está disponible en este navegador. Usa Chrome o Edge.");
}
