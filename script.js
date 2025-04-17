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
  
// Genera PDF A5 con jsPDF y QRious (layout con bloques azules y texto blanco)
async function createPdfCard(data, shortUrl) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: 'a5', unit: 'mm' });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;

    // Definición de colores
    const titleBlueRGB = [0, 51, 153]; // Azul oscuro para títulos y bordes
    const lightBlueRGB = [27, 77, 151]; // Azul celeste para textos secundarios

    // 1) NOMBRE (grande y centrado)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(32); // Tamaño grande para el título principal
    doc.setTextColor(...titleBlueRGB); // Azul oscuro para el título
    doc.text(data.nombre, pageW / 2, margin, { align: 'center' });

    // 2) QR (centrado con borde)
    const qrSize = 50; // Tamaño del QR
    const qrX = pageW / 2 - qrSize / 2; // Centramos horizontalmente
    const qrY = margin + 10;
    const qr = new QRious({ value: shortUrl, size: qrSize * 10 });

    // Dibujamos el borde alrededor del QR
    doc.setDrawColor(...titleBlueRGB); // Usamos el mismo color que el título
    doc.rect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, 'S'); // Borde con margen

    // Añadimos el QR dentro del borde
    doc.addImage(qr.toDataURL(), 'PNG', qrX, qrY, qrSize, qrSize);

    // 3) Instrucción bajo el QR
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(12); // Tamaño legible para la instrucción
    doc.setTextColor(...lightBlueRGB); // Aplicamos color azul celeste
    doc.text(
        'Escaneá para ver el producto en nuestra tienda web',
        pageW / 2,
        qrY + qrSize + 8, // Espaciado ajustado
        { align: 'center', maxWidth: pageW - 2 * margin }
    );

    // 4) BLOQUES DE ESPECIFICACIONES
    const specs = Object.entries(data)
        .filter(([k]) => k !== 'nombre'); // Sacamos el nombre
    const colGap = 8;
    const usableW = pageW - 2 * margin;
    const colW = (usableW - colGap) / 2;
    let cursorY = qrY + qrSize + 20; // Espaciado ajustado
    const headerH = 12; // Alto del header
    const msgH = 8; // Alto del mensaje
    const blockH = headerH + msgH;

    for (let i = 0; i < specs.length; i += 2) {
        const row = specs.slice(i, i + 2);
        row.forEach(([_, val], idx) => {
            const x = margin + idx * (colW + colGap);
            // 4.1) Dibujo del borde redondeado
            doc.setDrawColor(...titleBlueRGB);
            doc.roundedRect(x, cursorY, colW, blockH, 2, 2, 'S');

            // 4.2) Header (fondo azul)
            doc.setFillColor(...titleBlueRGB);
            doc.roundedRect(x, cursorY, colW, headerH, 2, 2, 'F');

            // 4.3) Texto de la especificación (blanco, negrita)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20); 
            doc.setTextColor(255, 255, 255); // Blanco para el título
            doc.text(
                val.especificacion,
                x + colW / 2,
                cursorY + headerH / 2 + 3,
                { align: 'center', maxWidth: colW - 4 }
            );

            // 4.4) Mensaje descriptivo (azul celeste, normal, centrado)
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12); 
            doc.setTextColor(...lightBlueRGB); // Aplicamos color azul celeste

            // Calculamos la posición Y para centrar el mensaje
            const messageY = cursorY + headerH + (msgH / 2) + 2;
            doc.text(
                val.mensaje,
                x + colW / 2, // Centramos el texto horizontalmente
                messageY,     // Posición Y ajustada para centrar verticalmente
                { align: 'center', maxWidth: colW - 4 }
            );
        });

        cursorY += blockH + 8; // Espacio vertical antes de la siguiente fila

        // Si es fila impar (solo un item), avanzamos igual
        if (row.length === 1) {
            cursorY += blockH + 8;
        }
    }

    // 5) PIE DE PÁGINA
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(12); // Tamaño legible para el pie de página
    doc.setTextColor(...lightBlueRGB); // Aplicamos color azul celeste
    doc.text(
        'Especificaciones orientativas. Su experiencia puede variar según el uso',
        pageW / 2,
        pageH - margin,
        { align: 'center', maxWidth: pageW - 2 * margin }
    );

    // 6) DESCARGA
    const filename = `tarjeta_${data.nombre.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
}