const input           = document.getElementById('productInput');
const searchBtn       = document.getElementById('searchBtn');
const retryBtn        = document.getElementById('retryBtn');
const nextBtn         = document.getElementById('nextBtn');
const responseContainer = document.getElementById('responseContainer');
const actions         = document.getElementById('actions');

const step1           = document.getElementById('step1');
const step2           = document.getElementById('step2');
const productUrlInput = document.getElementById('productUrl');
const generateCardBtn = document.getElementById('generateCardBtn');
const status          = document.getElementById('status');

let lastProductName = '';
let lastDataObject  = null;

// 1) BUSCAR PRODUCTO
async function sendToWebhook(productName) {
  actions.classList.add('hidden');
  responseContainer.innerHTML = `<p class="text-yellow-400 italic">Buscando "${productName}"…</p>`;
  try {
    const res = await fetch('https://known-moccasin-magical.ngrok-free.app/webhook/generar/tarjeta/notebook', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ producto: productName })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    lastDataObject = json.output;  // guardamos sólo el objeto `output`
    displayEditableJSON(json.output);
    actions.classList.remove('hidden');
  } catch (e) {
    responseContainer.innerHTML = `<p class="text-red-400">Error: ${e.message}</p>`;
    actions.classList.remove('hidden');
  }
}

function displayEditableJSON(obj) {
  responseContainer.innerHTML = `
    <textarea id="jsonEditor"
      class="w-full h-40 bg-gray-800 text-white p-2 rounded-md font-mono resize-none focus:ring-2 focus:ring-indigo-500"
    >${JSON.stringify(obj, null, 2)}</textarea>`;
}

// 2) EVENTOS STEP1
searchBtn.addEventListener('click', () => {
  const name = input.value.trim();
  if (!name) {
    responseContainer.innerHTML = `<p class="text-red-400">Ingresa un nombre.</p>`;
    return;
  }
  lastProductName = name;
  sendToWebhook(name);
});

retryBtn.addEventListener('click', () => {
  if (lastProductName) sendToWebhook(lastProductName);
});

nextBtn.addEventListener('click', () => {
  // parsear JSON editado
  const editor = document.getElementById('jsonEditor');
  try {
    lastDataObject = JSON.parse(editor.value);
  } catch (e) {
    responseContainer.innerHTML = `<p class="text-red-400">JSON inválido: ${e.message}</p>`;
    return;
  }
  // avanzar a paso 2
  step1.classList.add('hidden');
  step2.classList.remove('hidden');
});

// 3) STEP2: URL + GENERAR PDF
generateCardBtn.addEventListener('click', async () => {
  const url = productUrlInput.value.trim();
  if (!url) {
    status.textContent = 'Por favor ingresa la URL.';
    return;
  }
  status.textContent = 'Acortando URL…';
  try {
    const shortUrl = await shortenUrl(url);
    status.textContent = 'Generando QR y PDF…';
    await createPdfCard(lastDataObject, shortUrl);
    status.textContent = '¡Listo! Se descargó tu tarjeta.';
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }
});

// TinyURL API
// Acorta la URL usando el endpoint gratuito de TinyURL
async function shortenUrl(url) {
    const apiEndpoint = 'https://tinyurl.com/api-create.php?url=';
    const resp = await fetch(apiEndpoint + encodeURIComponent(url));
    if (!resp.ok) {
      throw new Error(`Error al acortar URL: HTTP ${resp.status}`);
    }
    const shortUrl = await resp.text();       // devuelve la URL como texto plano
    return shortUrl.trim();
  }
  

// Genera PDF A5 con jsPDF y QRious
async function createPdfCard(data, shortUrl) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ format: 'a5', unit: 'mm' });

  // Encabezado
  doc.setFontSize(20);
  doc.text(data.nombre, 15, 20);

  // Lista de especificaciones
  doc.setFontSize(12);
  let y = 30;
  for (let key of ['cpu','ram','almacenamiento','pantalla','sistemaOperativo']) {
    const { especificacion, mensaje } = data[key];
    doc.text(`${key.toUpperCase()}: ${especificacion}`, 15, y);
    doc.text(`→ ${mensaje}`, 20, y + 6);
    y += 12;
  }

  // Generar QR
  const qr = new QRious({ value: shortUrl, size: 120 });
  const qrDataUrl = qr.toDataURL();
  doc.addImage(qrDataUrl, 'PNG', 15, y + 10, 40, 40);

  // URL acortada
  doc.setFontSize(10);
  doc.text(shortUrl, 60, y + 30, { maxWidth: 100 });

  // Descargar
  const filename = `tarjeta_${data.nombre.replace(/\s+/g,'_')}.pdf`;
  doc.save(filename);
}