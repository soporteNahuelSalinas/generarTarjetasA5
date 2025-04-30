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
  responseContainer.innerHTML = `<p class="text-yellow-400 italic">Buscando \"${productName}\"…</p>`;
  
  // const url = 'https://known-moccasin-magical.ngrok-free.app/webhook/generar/tarjeta/notebook';
  const url = 'http://192.168.1.93:5678/webhook/generar/tarjeta/notebook';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ producto: productName })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    lastDataObject = json.output;
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
  const editor = document.getElementById('jsonEditor');
  try {
    lastDataObject = JSON.parse(editor.value);
  } catch (e) {
    responseContainer.innerHTML = `<p class="text-red-400">JSON inválido: ${e.message}</p>`;
    return;
  }
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

    // Cargamos las fuentes
    const [regResp, itaResp, bldResp, xboldResp] = await Promise.all([
      fetch('/fonts/medium.txt'),
      fetch('/fonts/italic.txt'),
      fetch('/fonts/bold.txt'),
      fetch('/fonts/xbold.txt')
    ]);
    if (!regResp.ok || !itaResp.ok || !bldResp.ok || !xboldResp.ok) throw new Error('No se pudo cargar la fuente.');
    const [regularBase64, italicBase64, boldBase64, xboldBase64] = await Promise.all([
      regResp.text(),
      itaResp.text(),
      bldResp.text(),
      xboldResp.text()
    ]);

    await createPdfCard(lastDataObject, shortUrl, regularBase64, italicBase64, boldBase64, xboldBase64);
    status.textContent = '¡Listo! Se descargó tu tarjeta.';
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }
});

// TinyURL API
async function shortenUrl(url) {
  const apiEndpoint = 'https://tinyurl.com/api-create.php?url=';
  const resp = await fetch(apiEndpoint + encodeURIComponent(url));
  if (!resp.ok) throw new Error(`Error al acortar URL: HTTP ${resp.status}`);
  return (await resp.text()).trim();
}

// Genera PDF A5 con jsPDF y QRious, usando fuentes custom
async function createPdfCard(data, shortUrl, regularB64, italicB64, boldB64, xboldB64) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ format: 'a5', unit: 'mm' });

  // Limpiar posibles prefijos data: y registrar en VFS
  const cleanReg = regularB64.replace(/^data:[^;]+;base64,/, '');
  const cleanIta = italicB64.replace(/^data:[^;]+;base64,/, '');
  const cleanBld = boldB64.replace(/^data:[^;]+;base64,/, '');
  const cleanXbld = xboldB64.replace(/^data:[^;]+;base64,/, '');

  doc.addFileToVFS('CustomRegular.ttf', cleanReg);
  doc.addFileToVFS('CustomItalic.ttf', cleanIta);
  doc.addFileToVFS('CustomBold.ttf', cleanBld);
  doc.addFileToVFS('CustomXBold.ttf', cleanXbld);

  doc.addFont('CustomRegular.ttf', 'CustomReg', 'normal');
  doc.addFont('CustomBold.ttf', 'CustomReg', 'bold');
  doc.addFont('CustomItalic.ttf', 'CustomReg', 'italic');
  doc.addFont('CustomXBold.ttf', 'CustomReg', 'extrabold');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const titleBlueRGB = [0, 51, 153];
  const lightBlueRGB = [27, 77, 151];

  // 1) NOMBRE (custom bold)
  doc.setFont('CustomReg', 'extrabold');
  doc.setFontSize(32);
  doc.setTextColor(...titleBlueRGB);
  doc.text(data.nombre, pageW / 2, margin, { align: 'center' });

  // 2) QR
  const qrSize = 50;
  const qrX = pageW / 2 - qrSize / 2;
  const qrY = margin + 10;
  const qr = new QRious({ value: shortUrl, size: qrSize * 10 });

  // Guardar el estado gráfico actual
  doc.saveGraphicsState();

  // Configurar el color y el ancho del borde solo para el QR
  doc.setDrawColor(...titleBlueRGB);
  doc.setLineWidth(1); // Ancho del borde en mm

  // Dibujar el rectángulo con bordes redondeados alrededor del QR
  const borderRadius = 2;
  doc.roundedRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, borderRadius, borderRadius, 'S');

  // Restaurar el estado gráfico anterior
  doc.restoreGraphicsState();

  // Agregar la imagen del QR
  doc.addImage(qr.toDataURL(), 'PNG', qrX, qrY, qrSize, qrSize);

  // Agregar la imagen del QR
  doc.addImage(qr.toDataURL(), 'PNG', qrX, qrY, qrSize, qrSize);

  // 3) Instrucción bajo QR (custom italic)
  doc.setFont('CustomReg', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(...lightBlueRGB);
  doc.text(
    'Escaneá para ver el producto en nuestra tienda web',
    pageW / 2,
    qrY + qrSize + 15,
    { align: 'center', maxWidth: pageW - 2 * margin }
  );

  // 4) Bloques de especificaciones
  const specs = Object.entries(data).filter(([k]) => k !== 'nombre');
  const colGap = 8;
  const usableW = pageW - 2 * margin;
  const colW = (usableW - colGap) / 2;
  let cursorY = qrY + qrSize + 20;
  const headerH = 12;
  const msgH = 12;
  const blockH = headerH + msgH;
  // const contentH = blockH - headerH;
  const contentH = blockH - 7;  

  for (let i = 0; i < specs.length; i += 2) {
    const row = specs.slice(i, i + 2);
    row.forEach(([_, val], idx) => {
      const x = margin + idx * (colW + colGap);

      doc.setDrawColor(...titleBlueRGB);
      doc.roundedRect(x, cursorY, colW, blockH, 2, 2, 'S');
      doc.setFillColor(...titleBlueRGB);
      doc.roundedRect(x, cursorY, colW, headerH, 2, 2, 'F');

      // Texto principal (custom bold)
      doc.setFont('CustomReg', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(255, 255, 255);
      doc.text(
        val.especificacion,
        x + colW / 2,
        cursorY + headerH / 2 + 3,
        { align: 'center', maxWidth: colW - 4 }
      );

      // Texto secundario (centrado vertical y horizontalmente)
      doc.setFont('CustomReg', 'normal');
      const fontSizeDescription = 12;doc.setFont('CustomReg', 'normal');
      doc.setFontSize(fontSizeDescription);
      doc.setTextColor(...lightBlueRGB);
      const maxTextWidth = colW - 8;
      const lines = doc.splitTextToSize(val.mensaje, maxTextWidth);
      const lineHeightFactor = 0.4;
      const lineHeight = fontSizeDescription * lineHeightFactor;
      const totalHeight = lines.length * lineHeight;
      
      // Calcular posición vertical
      const startY = cursorY + headerH + (contentH - totalHeight) / 2 + lineHeight * 0.25;
      
      lines.forEach((line, index) => {
        doc.text(
          line,
          x + colW / 2,
          startY + index * lineHeight,
          { align: 'center' }
        );
      });
    });

    cursorY += blockH + 8;
    if (row.length === 1) cursorY += blockH + 8;
  }
  

  // 5) Pie de página (custom italic)
  doc.setFont('CustomReg', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(...lightBlueRGB);
  doc.text(
    'Especificaciones orientativas. Su experiencia puede variar según el uso',
    pageW / 2,
    pageH - margin,
    { align: 'center', maxWidth: pageW - 2 * margin }
  );

  doc.save(`tarjeta_${data.nombre.replace(/\s+/g, '_')}.pdf`);
}