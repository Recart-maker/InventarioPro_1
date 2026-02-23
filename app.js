let productosBase = [];
const { jsPDF } = window.jspdf;
window.resumenInventario = { fisico: 0, sistema: 0, difPesos: 0, porcentaje: "0.00" };
let productoActualParaScan = null;
let productoEncontradoModal = null;
let lastScannedCode = "";
let lastScannedTime = 0;

window.onload = () => {
    ['bodega', 'site', 'fecha', 'responsable'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = localStorage.getItem(`meta-${id}`) || "";
    });
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        const btn = document.getElementById('dark-mode-btn');
        if(btn) btn.innerText = "☀️ Light";
    }
};

function guardarMeta() {
    ['bodega', 'site', 'fecha', 'responsable'].forEach(id => {
        const el = document.getElementById(id);
        if(el) localStorage.setItem(`meta-${id}`, el.value);
    });
}

function leerArchivo(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const filas = XLSX.utils.sheet_to_json(worksheet, {header: 1});

            productosBase = filas.slice(1).map(col => {
                if (!col[0] || !col[1]) return null;
                return {
                    codigo: String(col[0]).trim(),
                    nombre: String(col[1]).trim(),
                    lote: col[2] ? String(col[2]).trim() : "S/L",
                    un: col[4] ? String(col[4]).trim() : "UN",
                    teorico: parseFloat(col[5]) || 0,
                    precio: Math.round(parseFloat(col[6])) || 0
                };
            }).filter(p => p !== null);

            renderizarTarjetas(productosBase);
        } catch (error) {
            alert("Error al leer el Excel.");
        }
    };
    reader.readAsArrayBuffer(file);
}

function renderizarTarjetas(lista) {
    const container = document.getElementById('product-list');
    if (!lista || lista.length === 0) {
        container.innerHTML = "<p style='text-align:center; padding:20px;'>Cargue un archivo Excel.</p>";
        return;
    }

    container.innerHTML = lista.map(p => {
        const key = `inv-${p.codigo}-${p.lote}`;
        const barcodesGuardados = JSON.parse(localStorage.getItem(`barcodes-${p.codigo}`)) || [];
        const val = localStorage.getItem(key);
        const fisicoVal = val !== null ? parseFloat(val) : 0;
        const inputVal = val !== null ? val : "";
        const dif = fisicoVal - p.teorico;
        const colorDif = dif < 0 ? "txt-rojo" : (dif > 0 ? "txt-verde" : "txt-neutral");

        return `
        <div class="product-card">
            <div class="header-card">
                <span>ID: ${p.codigo}</span>
                <span>${p.un}</span>
            </div>
            <div class="product-name">${p.nombre}</div>
            <div class="barcode-section" style="background: rgba(0,0,0,0.05); padding: 8px; border-radius: 5px; margin: 8px 0;">
                <div class="barcode-list" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 5px;">
                    ${barcodesGuardados.map(b => `<span style="background:#d1d8e0; color:#333; font-size:0.7em; padding:2px 6px; border-radius:3px;">🏷️ ${b}</span>`).join('')}
                </div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="abrirEscanerTarjeta('${p.codigo}')" style="flex:1; font-size:0.7em; padding:8px; background:#34495e; color:white; border:none; border-radius:4px;">📸 Scan</button>
                    <button onclick="capturarNuevoBarcode('${p.codigo}')" style="flex:1; font-size:0.7em; padding:8px; background:#7f8c8d; color:white; border:none; border-radius:4px;">➕ BarCode</button>
                </div>
            </div>
            <div class="audit-grid">
                <div class="audit-item"><label>Sist.</label><span>${p.teorico.toFixed(2)}</span></div>
                <div class="audit-item">
                    <label>Físico</label>
                    <input type="number" data-key="${key}" inputmode="decimal" value="${inputVal}" placeholder="0" 
                           oninput="actualizarConteo(this, ${p.teorico}, ${p.precio}, '${key}')">
                </div>
                <div class="audit-item"><label>Total Fís.</label><span class="v-total">${formatearMoneda(fisicoVal * p.precio)}</span></div>
            </div>
            <div class="dif-container">
                AJUSTE: <span class="val-dif-pesos ${colorDif}">${formatearMoneda(dif * p.precio)}</span>
            </div>
        </div>`;
    }).join('');
    actualizarTotalesGenerales();
    actualizarBarraProgreso();
}

function abrirEscanerTarjeta(codigoProducto) {
    productoActualParaScan = codigoProducto;
    iniciarQuagga();
}

function abrirEscanerBusqueda() {
    productoActualParaScan = "BUSQUEDA_GENERAL";
    iniciarQuagga();
}

function iniciarQuagga() {
    const cam = document.getElementById('camera-scanner');
    if(!cam) return;
    cam.style.display = 'block';
    Quagga.init({
        inputStream: { name: "Live", type: "LiveStream", target: document.querySelector('#interactive') },
        decoder: { readers: ["ean_reader", "code_128_reader", "upc_reader"] }
    }, (err) => {
        if (err) { alert("Error cámara"); return; }
        Quagga.start();
    });
}

Quagga.onDetected((result) => {
    const code = result.codeResult.code;
    const now = Date.now();
    if (code === lastScannedCode && (now - lastScannedTime) < 1500) return;
    lastScannedCode = code; lastScannedTime = now;
    if (navigator.vibrate) navigator.vibrate(100);

    if (productoActualParaScan === "BUSQUEDA_GENERAL") {
        let pMatch = productosBase.find(p => {
            const bcs = JSON.parse(localStorage.getItem(`barcodes-${p.codigo}`)) || [];
            return bcs.includes(code);
        });
        if (pMatch) { cerrarEscaner(); abrirModalSuma(pMatch, code); }
    } else {
        const bcs = JSON.parse(localStorage.getItem(`barcodes-${productoActualParaScan}`)) || [];
        if (bcs.includes(code)) sumarUnoAlConteo(productoActualParaScan);
    }
});

function sumarUnoAlConteo(id) {
    const p = productosBase.find(prod => prod.codigo === id);
    if (p) {
        const key = `inv-${p.codigo}-${p.lote}`;
        const nVal = (parseFloat(localStorage.getItem(key)) || 0) + 1;
        localStorage.setItem(key, nVal);
        const input = document.querySelector(`input[data-key="${key}"]`);
        if (input) { input.value = nVal; actualizarConteo(input, p.teorico, p.precio, key); }
        mostrarAvisoRapido(`+1 (Total: ${nVal})`);
    }
}

function abrirModalSuma(p, bc) {
    productoEncontradoModal = p;
    const val = localStorage.getItem(`inv-${p.codigo}-${p.lote}`) || "0";
    document.getElementById('modal-nombre').innerText = p.nombre;
    document.getElementById('modal-barcode').innerText = "Código: " + bc;
    document.getElementById('modal-actual').innerText = val + " " + p.un;
    document.getElementById('modal-input-suma').value = "";
    document.getElementById('modal-suma').style.display = 'flex';
    setTimeout(() => document.getElementById('modal-input-suma').focus(), 300);
}

function confirmarSumaModal() {
    const cant = parseFloat(document.getElementById('modal-input-suma').value) || 0;
    if (cant > 0) {
        const p = productoEncontradoModal;
        const key = `inv-${p.codigo}-${p.lote}`;
        const nueva = (parseFloat(localStorage.getItem(key)) || 0) + cant;
        localStorage.setItem(key, nueva);
        const input = document.querySelector(`input[data-key="${key}"]`);
        if (input) { input.value = nueva; actualizarConteo(input, p.teorico, p.precio, key); }
        cerrarModalSuma();
    }
}

function cerrarModalSuma() { document.getElementById('modal-suma').style.display = 'none'; }
function cerrarEscaner() { Quagga.stop(); document.getElementById('camera-scanner').style.display = 'none'; }

function actualizarConteo(input, teorico, precio, key) {
    localStorage.setItem(key, input.value || 0);
    const fis = parseFloat(input.value) || 0;
    const dif = fis - teorico;
    const card = input.closest('.product-card');
    if(card) {
        card.querySelector('.v-total').innerText = formatearMoneda(fis * precio);
        const vD = card.querySelector('.val-dif-pesos');
        vD.innerText = formatearMoneda(dif * precio);
        vD.className = "val-dif-pesos " + (dif < 0 ? "txt-rojo" : (dif > 0 ? "txt-verde" : "txt-neutral"));
    }
    actualizarTotalesGenerales();
    actualizarBarraProgreso();
}

function actualizarTotalesGenerales() {
    let tSist = 0, tFis = 0;
    productosBase.forEach(p => {
        const f = parseFloat(localStorage.getItem(`inv-${p.codigo}-${p.lote}`)) || 0;
        tSist += (p.teorico * p.precio);
        tFis += (f * p.precio);
    });
    const difP = tFis - tSist;
    const porc = tSist !== 0 ? (Math.abs(difP) / tSist) * 100 : 0;
    window.resumenInventario = { fisico: tFis, sistema: tSist, difPesos: difP, porcentaje: porc.toFixed(2) };
    document.getElementById('gran-total').innerText = formatearMoneda(tFis);
    const ie = document.getElementById('info-extra-pantalla');
    const col = difP < 0 ? 'txt-rojo' : (difP > 0 ? 'txt-verde' : '');
    ie.innerHTML = `Dif: <span class="${col}">${formatearMoneda(difP)}</span> | Ajuste: <span class="${col}">${porc.toFixed(2)}%</span>`;
}

function exportarExcel() {
    try {
        const res = window.resumenInventario;
        const meta = { 
            b: document.getElementById('bodega').value || "S/N", 
            s: document.getElementById('site').value || "S/S", 
            f: formatearFechaChile(document.getElementById('fecha').value),
            r: document.getElementById('responsable').value || "S/R" 
        };

        // 1. Cabecera (Separamos las etiquetas de los valores para poder formatearlos)
        const data = [
            ["REPORTE DE INVENTARIO"],
            [`Bodega: ${meta.b}`, `Site: ${meta.s}`, `Fecha: ${meta.f}`, `Responsable: ${meta.r}`],
            ["Total Sistema:", Number(res.sistema), "Total Físico:", Number(res.fisico), "% Ajuste:", `${res.porcentaje}%`],
            [],
            ["ID Sistema", "Producto", "UN", "Sist.", "Físico", "Dif. Cant", "Vr. Unitario", "Total Físico", "Total Ajuste", "Barcodes"]
        ];

        // 2. Datos de productos
        productosBase.forEach(p => {
            const valFisico = localStorage.getItem(`inv-${p.codigo}-${p.lote}`);
            const f = valFisico !== null ? parseFloat(valFisico) : 0;
            const d = f - p.teorico;
            const bcs = JSON.parse(localStorage.getItem(`barcodes-${p.codigo}`)) || [];
            
            data.push([
                p.codigo, p.nombre, p.un, 
                Number(p.teorico.toFixed(2)), Number(f.toFixed(2)), Number(d.toFixed(2)), 
                Number(p.precio), Number((f * p.precio).toFixed(0)), Number((d * p.precio).toFixed(0)), 
                bcs.join(" - ")
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();

        // 3. Aplicar Formato a TODAS las celdas numéricas (incluyendo el resumen)
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell = ws[XLSX.utils.encode_cell({r: R, c: C})];
                if (!cell || cell.t !== 'n') continue;

                // Si es dinero (Columnas G, H, I o los valores del resumen en la fila 3)
                // En la fila 3 (R=2), los valores están en las columnas B (C=1) y D (C=3)
                if ((C >= 6 && C <= 8) || (R === 2 && (C === 1 || C === 3))) {
                    cell.z = '"$"#,##0'; 
                } 
                // Si son cantidades (Columnas Sist, Fís, Dif)
                else if (C >= 3 && C <= 5) {
                    cell.z = '#,##0.00';
                }
            }
        }

        ws['!cols'] = [{wch:12}, {wch:40}, {wch:6}, {wch:10}, {wch:10}, {wch:10}, {wch:12}, {wch:15}, {wch:15}, {wch:25}];

        XLSX.utils.book_append_sheet(wb, ws, "Inventario");
        XLSX.writeFile(wb, `Inventario_${meta.b}.xlsx`);
    } catch (e) { 
        console.error(e);
        alert("Error al generar Excel"); 
    }
}

function exportarPDF() {
    try {
        const doc = new jsPDF('l', 'mm', 'a4');
        const res = window.resumenInventario;
        const meta = { 
            b: document.getElementById('bodega').value || "S/N", 
            s: document.getElementById('site').value || "S/S", 
            f: formatearFechaChile(document.getElementById('fecha').value),
            r: document.getElementById('responsable').value || "S/R" 
        };
        const fM = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
        doc.setFontSize(16); doc.text("REPORTE DE INVENTARIO", 148.5, 12, { align: 'center' });
        doc.setFontSize(9); doc.text(`Bodega: ${meta.b} | Site: ${meta.s} | Fecha: ${meta.f} | Responsable: ${meta.r}`, 148.5, 18, { align: 'center' });

        const tableBody = productosBase.map(p => {
            const f = parseFloat(localStorage.getItem(`inv-${p.codigo}-${p.lote}`)) || 0;
            const d = f - p.teorico;
            return [p.codigo, p.nombre, p.un, p.teorico.toFixed(2), f.toFixed(2), d.toFixed(2), fM(p.precio), fM(f*p.precio), fM(d*p.precio)];
        });

        doc.autoTable({
            startY: 22,
            head: [['Cód', 'Producto', 'UN', 'Sist', 'Fís', 'Dif', 'Precio', 'Total Fís', 'Total Ajuste']],
            body: tableBody,
            styles: { fontSize: 7, halign: 'center' },
            columnStyles: { 1: { halign: 'left', cellWidth: 50 } },
            didParseCell: (data) => {
                if ((data.column.index === 5 || data.column.index === 8) && data.section === 'body') {
                    const val = parseFloat(data.cell.raw.toString().replace(/[^0-9.-]/g, ''));
                    if (val < 0) data.cell.styles.textColor = [200, 0, 0];
                    else if (val > 0) data.cell.styles.textColor = [0, 128, 0];
                }
            }
        });
        const y = doc.lastAutoTable.finalY + 8;
        doc.setTextColor(0); doc.text(`SISTEMA: ${fM(res.sistema)} | FÍSICO: ${fM(res.fisico)}`, 14, y);
        const cA = res.difPesos < 0 ? [200,0,0] : (res.difPesos > 0 ? [0,128,0] : [0,0,0]);
        doc.setTextColor(cA[0], cA[1], cA[2]); doc.text(`DIFERENCIA TOTAL: ${fM(res.difPesos)} (${res.porcentaje}%)`, 14, y+6);
        doc.save(`Reporte_${meta.b}.pdf`);
    } catch (e) { alert("Error PDF"); }
}

function capturarNuevoBarcode(id) {
    const bc = prompt("Nuevo código de barra para: " + id);
    if (bc) {
        let exs = JSON.parse(localStorage.getItem(`barcodes-${id}`)) || [];
        if (!exs.includes(bc)) {
            exs.push(bc); localStorage.setItem(`barcodes-${id}`, JSON.stringify(exs));
            renderizarTarjetas(productosBase);
        }
    }
}

function formatearMoneda(v) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v); }
function formatearFechaChile(f) { if(!f) return "S/F"; const p = f.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }
function actualizarBarraProgreso() {
    const t = productosBase.length; if (t === 0) return;
    const c = productosBase.filter(p => localStorage.getItem(`inv-${p.codigo}-${p.lote}`) !== null).length;
    const porc = Math.round((c / t) * 100);
    const bar = document.getElementById('progress-bar');
    if (bar) { bar.style.width = porc + "%"; bar.innerText = porc + "%"; bar.style.backgroundColor = porc < 100 ? "#f39c12" : "#27ae60"; }
}
function filtrarProductos() {
    const t = document.getElementById('search').value.toLowerCase();
    const f = productosBase.filter(p => p.nombre.toLowerCase().includes(t) || p.codigo.toLowerCase().includes(t));
    renderizarTarjetas(f);
}
function limpiarTodo() { if(confirm("¿Borrar todo?")) { localStorage.clear(); location.reload(); } }
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isD = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isD ? 'dark' : 'light');
    document.getElementById('dark-mode-btn').innerText = isD ? "☀️ Light" : "🌙 Dark";
}
function mostrarAvisoRapido(m) {
    const a = document.createElement("div");
    a.style = "position:fixed; top:20%; left:50%; transform:translate(-50%,-50%); background:rgba(39,174,96,0.9); color:white; padding:15px; border-radius:50px; z-index:10000; font-weight:bold;";
    a.innerText = m; document.body.appendChild(a);
    setTimeout(() => a.remove(), 1000);
}
document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        const ins = Array.from(document.querySelectorAll('input[type="number"]'));
        const idx = ins.indexOf(document.activeElement);
        if (idx > -1 && idx < ins.length - 1) { ins[idx+1].focus(); ins[idx+1].select(); }
    }
});