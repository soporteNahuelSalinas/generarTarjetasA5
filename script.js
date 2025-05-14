const input             = document.getElementById('productInput');
const priceInput        = document.getElementById('priceInput');
const searchBtn         = document.getElementById('searchBtn');
const retryBtn          = document.getElementById('retryBtn');
const nextBtn           = document.getElementById('nextBtn');
const responseContainer = document.getElementById('responseContainer');
const actions           = document.getElementById('actions');

const step1             = document.getElementById('step1');
const step2             = document.getElementById('step2');
const productUrlInput   = document.getElementById('productUrl');
const generateCardBtn   = document.getElementById('generateCardBtn');
const status            = document.getElementById('status');

let lastProductName = '';
let lastDataObject  = null;

// 1) BUSCAR PRODUCTO
async function sendToWebhook(productName) {
  actions.classList.add('hidden');
  responseContainer.innerHTML = `<p class="text-yellow-400 italic">Buscando \"${productName}\"…</p>`;
  const url = 'https://known-moccasin-magical.ngrok-free.app/webhook/generar/tarjeta/notebook';
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
retryBtn.addEventListener('click', () => { if (lastProductName) sendToWebhook(lastProductName); });
nextBtn.addEventListener('click', () => {
  const editor = document.getElementById('jsonEditor');
  try { lastDataObject = JSON.parse(editor.value); } 
  catch (e) { responseContainer.innerHTML = `<p class="text-red-400">JSON inválido: ${e.message}</p>`; return; }
  step1.classList.add('hidden');
  step2.classList.remove('hidden');
});

// 3) STEP2: URL + GENERAR PDF
generateCardBtn.addEventListener('click', async () => {
  const url    = productUrlInput.value.trim();
  const precio = parseFloat(priceInput.value);
  if (isNaN(precio)) { status.textContent = 'Por favor ingresa un precio válido.'; return; }
  if (!url)       { status.textContent = 'Por favor ingresa la URL.'; return; }
  status.textContent = 'Acortando URL…';
  try {
    const shortUrl = await shortenUrl(url);
    status.textContent = 'Generando QR y PDF…';
    const [regResp, itaResp, bldResp, xboldResp] = await Promise.all([
      fetch('/fonts/medium.txt'), fetch('/fonts/italic.txt'),
      fetch('/fonts/bold.txt'),   fetch('/fonts/xbold.txt')
    ]);
    if (!regResp.ok||!itaResp.ok||!bldResp.ok||!xboldResp.ok) throw new Error('No se pudo cargar la fuente.');
    const [regularBase64, italicBase64, boldBase64, xboldBase64] = await Promise.all([
      regResp.text(), itaResp.text(), bldResp.text(), xboldResp.text()
    ]);
    await createPdfCard(lastDataObject, shortUrl, precio, regularBase64, italicBase64, boldBase64, xboldBase64);
    status.textContent = '¡Listo! Se descargó tu tarjeta.';
  } catch (e) { status.textContent = `Error: ${e.message}`; }
});

// TinyURL API
async function shortenUrl(url) {
  const resp = await fetch('https://tinyurl.com/api-create.php?url='+encodeURIComponent(url));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return (await resp.text()).trim();
}

// Genera PDF A6 con jsPDF y QRious, usando fuentes custom y factor de escala
async function createPdfCard(data, shortUrl, precio, regularB64, italicB64, boldB64, xboldB64) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ format: 'a6', unit: 'mm' });
  const pageW = doc.internal.pageSize.getWidth();
  const scale = pageW/148;
  const margin = 15*scale;
  const titleBlueRGB=[0,51,153], lightBlueRGB=[27,77,151];
  // cargar fuentes
  [regularB64,italicB64,boldB64,xboldB64].forEach((b64,i)=>{
    const clean=b64.replace(/^data:[^;]+;base64,/,'');
    const name=['CustomRegular','CustomItalic','CustomBold','CustomXBold'][i]+'.ttf';
    doc.addFileToVFS(name,clean);
    doc.addFont(name,'CustomReg',['normal','italic','bold','extrabold'][i]);
  });
  // Nombre
  doc.setFont('CustomReg','extrabold').setFontSize(32*scale).setTextColor(...titleBlueRGB)
     .text(data.nombre,pageW/2,margin,{align:'center'});
  // Precio
  // formatea con separador de miles “.” y sin decimales
  const precioFormateado = precio.toLocaleString('es-ES', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  });

  doc
    .setFont('CustomReg','bold')
    .setFontSize(24 * scale)
    .setTextColor(...titleBlueRGB)
    .text(`$ ${precioFormateado}`, pageW/2, margin + 12*scale, { align: 'center' });

  // QR
  const qrSize=40*scale, qrX=pageW/2-qrSize/2, qrY=margin+20*scale;
  const qr=new QRious({value:shortUrl,size:qrSize*10});
  doc.saveGraphicsState().setDrawColor(...titleBlueRGB).setLineWidth(1)
     .roundedRect(qrX-3*scale,qrY-3*scale,qrSize+6*scale,qrSize+6*scale,2*scale,2*scale,'S')
     .restoreGraphicsState().addImage(qr.toDataURL(),'PNG',qrX,qrY,qrSize,qrSize);
  // texto QR
  doc.setFont('CustomReg','italic').setFontSize(12*scale).setTextColor(...lightBlueRGB)
     .text('Escaneá para ver el producto en nuestra tienda web',pageW/2,qrY+qrSize+15*scale,
           {align:'center',maxWidth:pageW-2*margin});
  // specs
  const specs=Object.entries(data).filter(([k])=>k!=='nombre');
  let cursorY=qrY+qrSize+20*scale; const colGap=8*scale;
  const usableW=pageW-2*margin, colW=(usableW-colGap)/2;
  specs.forEach(([,val],i)=>{
    const idx=i%2, x=margin+idx*(colW+colGap);
    if(idx===0&&i>0) cursorY+=((12*scale+12*scale)+8*scale);
    doc.setDrawColor(...titleBlueRGB).roundedRect(x,cursorY,colW,12*scale+12*scale,2*scale,2*scale,'S')
       .setFillColor(...titleBlueRGB).roundedRect(x,cursorY,colW,12*scale,2*scale,2*scale,'F');
    doc.setFont('CustomReg','bold').setFontSize(20*scale).setTextColor(255,255,255)
       .text(val.especificacion,x+colW/2,cursorY+12*scale/2+3*scale,{align:'center',maxWidth:colW-4*scale});
    doc.setFont('CustomReg','normal').setFontSize(12*scale).setTextColor(...lightBlueRGB);
    const lines=doc.splitTextToSize(val.mensaje,colW-8*scale), lh=12*scale*0.4;
    const totalH=lines.length*lh, startY=cursorY+12*scale+( (12*scale-7*scale)-totalH)/2+lh*0.25 + 6 * scale; // Se mueve 6 unidades hacia abajo
    lines.forEach((ln,j)=>doc.text(ln,x+colW/2,startY+j*lh,{align:'center'}));
  });
  // pie
  doc.setFont('CustomReg','italic').setFontSize(12*scale).setTextColor(...lightBlueRGB)
     .text('Especificaciones orientativas. Su experiencia puede variar según el uso',
           pageW/2,doc.internal.pageSize.getHeight()-margin+5*scale,
           {align:'center',maxWidth:pageW-2*margin});
  doc.save(`tarjeta_${data.nombre.replace(/\s+/g,'_')}.pdf`);
}
