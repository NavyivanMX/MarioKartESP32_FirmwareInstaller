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
  $("transmitterConfigPanel").classList.toggle("hidden", kind !== "transmitter");
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
      flashMode: "qio",
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
    } else {
      setStatus("✓ Transmitter instalado correctamente. Ahora puedes guardar la MAC del Receiver.");
      setMacValidation();
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
    try { await transport.disconnect(); } catch (_) {}
  }
}

async function openApplicationSerial() {
  await closeEspToolTransport();

  if (!port) {
    throw new Error("No hay puerto serial conectado.");
  }

  if (!port.readable && !port.writable) {
    await port.open({ baudRate: 115200 });
  }
}

async function sendApplicationCommand(command, timeoutMs = 1800) {
  await openApplicationSerial();

  const writer = port.writable.getWriter();
  const encoder = new TextEncoder();
  try {
    await writer.write(encoder.encode(`${command}\r\n`));
  } finally {
    writer.releaseLock();
  }

  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let response = "";
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(100, deadline - Date.now());
      const result = await Promise.race([
        reader.read(),
        new Promise(resolve => setTimeout(() => resolve({ timeout: true }), remaining))
      ]);

      if (result.timeout) break;
      if (result.done) break;
      response += decoder.decode(result.value, { stream: true });

      if (response.includes("MKCFG OK") || response.includes("MKCFG CUSTOM_MAC=") || response.includes("MKCFG ERROR")) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  log(`CMD> ${command}`);
  if (response.trim()) log(`ESP32> ${response.trim()}`);
  return response;
}

async function tryReadExistingTransmitterConfig() {
  try {
    const response = await sendApplicationCommand("MKCFG GET", 1200);
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
