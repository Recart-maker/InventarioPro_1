let productosBase = [];
const { jsPDF } = window.jspdf;

// Asegurar que el objeto de resumen exista siempre para evitar errores de descarga
window.resumenInventario = { fisico: 0, sistema: 0, difPesos: 0, porcentaje: "0.00" };

window.onload = () => {
    ['bodega', 'site', 'fecha', 'responsable'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = localStorage.getItem(`meta-${id}`) || "";
    });
};

function guardarMeta() {
    ['bodega', 'site', 'fecha', 'responsable'].forEach(id => {
        const el = document.getElementById(id);
        if(el) localStorage.setItem(`meta-${id}`, el.value);
    });
}

function formatearFechaChile(fechaISO) {
    if (!fechaISO) return "S/F";
    const partes = fechaISO.split('-');
    return partes.length === 3 ? `${partes[2]} - ${partes[1]} - ${partes[0]}` : fechaISO;
}

function leerArchivo(input) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const filas = XLSX.utils.sheet_to_json(worksheet, {header: 1});

            productosBase = filas.slice(1).map(col => {
                if (!col[0]) return null;
                return {
                    codigo: String(col[0] || "").trim(),
                    nombre: String(col[1] || "").trim(),
                    lote: String(col[2] || "").trim(),
                    un: String(col[4] || "").trim(),
                    teorico: parseFloat(col[5]) || 0,
                    precio: Math.round(parseFloat(col[6]) || 0)
                };
            }).filter(p => p !== null);
            renderizarTarjetas(productosBase);
        } catch (error) {
            alert("Error al leer el Excel.");
        }
    };
    reader.readAsArrayBuffer(file);
}

// Función para vincular un nuevo código de barra (El botón + BarCode)
function capturarNuevoBarcode(idProducto) {
    const nuevoCodigo = prompt("Escanee o ingrese el nuevo código de barra para este producto:");
    if (nuevoCodigo) {
        let existentes = JSON.parse(localStorage.getItem(`barcodes-${idProducto}`)) || [];
        if (!existentes.includes(nuevoCodigo)) {
            existentes.push(nuevoCodigo);
            localStorage.setItem(`barcodes-${idProducto}`, JSON.stringify(existentes));
            renderizarTarjetas(productosBase); // Refrescar vista
        } else {
            alert("Este código ya está vinculado a este producto.");
        }
    }
}

function renderizarTarjetas(lista) {
    const container = document.getElementById('product-list');
    
    // Si la lista está vacía, mostramos un mensaje
    if (!lista || lista.length === 0) {
        container.innerHTML = "<p style='text-align:center; padding:20px;'>Cargue un archivo Excel para comenzar.</p>";
        return;
    }

    container.innerHTML = lista.map(p => {
        const key = `inv-${p.codigo}-${p.lote}`;
        
        // Recuperar barcodes guardados (si no hay, devuelve lista vacía)
        const barcodesGuardados = JSON.parse(localStorage.getItem(`barcodes-${p.codigo}`)) || [];
        
        const val = localStorage.getItem(key);
        const fisicoVal = val !== null ? parseFloat(val) : 0;
        const inputVal = val !== null ? val : "";
        
        const dif = fisicoVal - p.teorico;
        const colorDif = dif < 0 ? "txt-rojo" : (dif > 0 ? "txt-verde" : "txt-neutral");

        // Construimos el HTML de la tarjeta
        return `
        <div class="product-card">
            <div class="header-card">
                <span>ID: ${p.codigo}</span>
                <span class="lote-val">${p.lote}</span>
                <span>${p.un}</span>
            </div>
            <div class="product-name">${p.nombre}</div>
            
            <div class="barcode-section" style="background: #f0f3f5; padding: 8px; border-radius: 5px; margin: 8px 0;">
                <div class="barcode-list" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 5px;">
                    ${barcodesGuardados.map(b => `<span style="background:#d1d8e0; font-size:0.7em; padding:2px 6px; border-radius:3px;">🏷️ ${b}</span>`).join('')}
                </div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="abrirEscaner('${p.codigo}')" style="flex:1; font-size:0.7em; padding:5px; background:#34495e; color:white; border:none; border-radius:4px;">📸 Scan</button>
                    <button onclick="capturarNuevoBarcode('${p.codigo}')" style="flex:1; font-size:0.7em; padding:5px; background:#7f8c8d; color:white; border:none; border-radius:4px;">➕ BarCode</button>
                </div>
            </div>

            <div class="audit-grid">
                <div class="audit-item"><label>Sist.</label><span>${p.teorico}</span></div>
                <div class="audit-item">
                    <label>Físico</label>
                    <input type="number" data-key="${key}" inputmode="decimal" value="${inputVal}" placeholder="0" 
                           oninput="actualizarConteo(this, ${p.teorico}, ${p.precio}, '${key}')">
                </div>
                <div class="audit-item">
                    <label>Total Fís.</label>
                    <span class="v-total">${formatearMoneda(fisicoVal * p.precio)}</span>
                </div>
            </div>
            <div class="dif-container">
                VALOR DIFERENCIA: <span class="val-dif-pesos ${colorDif}">${formatearMoneda(dif * p.precio)}</span>
                <div style="font-size:0.75em;">CANT. DIF: <span class="cant-dif-val ${colorDif}">${dif.toFixed(2)}</span></div>
            </div>
        </div>`;
    }).join('');

    actualizarTotalesGenerales();
    actualizarBarraProgreso();
}
function actualizarConteo(input, teorico, precio, key) {
    if (input.value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, input.value);
    
    const fisicoVal = parseFloat(input.value) || 0;
    const dif = fisicoVal - teorico;
    const card = input.closest('.product-card');
    
    card.querySelector('.v-total').innerText = formatearMoneda(fisicoVal * precio);
    const valD = card.querySelector('.val-dif-pesos');
    const cantD = card.querySelector('.cant-dif-val');
    
    valD.innerText = formatearMoneda(dif * precio);
    cantD.innerText = dif.toFixed(2);

    const color = dif < 0 ? "txt-rojo" : (dif > 0 ? "txt-verde" : "txt-neutral");
    valD.className = "val-dif-pesos " + color;
    cantD.className = "cant-dif-val " + color;
    
    actualizarTotalesGenerales();
    actualizarBarraProgreso(); // <--- AGREGA ESTA LÍNEA AQUÍ
}

function actualizarTotalesGenerales() {
    let tSist = 0, tFis = 0;
    productosBase.forEach(p => {
        const val = localStorage.getItem(`inv-${p.codigo}-${p.lote}`);
        const f = val !== null ? parseFloat(val) : 0;
        tSist += (p.teorico * p.precio);
        tFis += (f * p.precio);
    });

    const difP = tFis - tSist;
    const porc = tSist !== 0 ? (Math.abs(difP) / tSist) * 100 : 0;

    // Guardar en objeto global para las descargas
    window.resumenInventario = { fisico: tFis, sistema: tSist, difPesos: difP, porcentaje: porc.toFixed(2) };

    // Actualizar pantalla
    const granTotal = document.getElementById('gran-total');
    if(granTotal) granTotal.innerText = formatearMoneda(tFis);

    const infoExtra = document.getElementById('info-extra-pantalla');
    if(infoExtra) {
        const color = difP < 0 ? 'txt-rojo' : (difP > 0 ? 'txt-verde' : '');
        infoExtra.innerHTML = `Dif: <span class="${color}">${formatearMoneda(difP)}</span> | Ajuste: <span class="${color}">${porc.toFixed(2)}%</span>`;
    }
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

        const fM_Cabecera = (n) => new Intl.NumberFormat('es-CL', { 
            style: 'currency', currency: 'CLP', maximumFractionDigits: 0 
        }).format(n);

        // Cabecera del archivo
        const data = [
            ["REPORTE DE INVENTARIO PROFESIONAL - UPC SAN FRANCISCO"],
            [`Bodega: ${meta.b}`, `Site: ${meta.s}`, `Fecha: ${meta.f}`, `Responsable: ${meta.r}`],
            [`Total Sistema:`, fM_Cabecera(res.sistema), `Total Físico:`, fM_Cabecera(res.fisico), `% Ajuste:`, parseFloat(res.porcentaje) / 100],
            [],
            ["ID Sistema", "Producto", "Lote", "UN", "Sist.", "Físico", "Dif. Cant", "Vr. Unitario", "Total Físico", "Barcodes Vinculados"]
        ];

        // Cuerpo de la tabla
        productosBase.forEach(p => {
            const key = `inv-${p.codigo}-${p.lote}`;
            const f = parseFloat(localStorage.getItem(key)) || 0;
            const d = f - p.teorico;
            
            // BUSCAMOS LOS BARCODES CAPTURADOS
            const bcs = JSON.parse(localStorage.getItem(`barcodes-${p.codigo}`)) || [];
            const listaBarcodes = bcs.join(" - ");

            data.push([
                p.codigo, 
                p.nombre, 
                p.lote, 
                p.un, 
                p.teorico, 
                f, 
                d, 
                p.precio, 
                (f * p.precio), 
                listaBarcodes
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();

        // Formatos de moneda y colores (opcional, para Excel moderno)
        const fmtMoneda = '"$"#,##0';
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = 4; R <= range.e.r; ++R) {
            [7, 8].forEach(C => { // Columnas H e I
                const cell = ws[XLSX.utils.encode_cell({r: R, c: C})];
                if (cell) cell.z = fmtMoneda;
            });
        }

        // Ajuste de anchos de columna
        ws['!cols'] = [
            {wch: 12}, {wch: 40}, {wch: 10}, {wch: 6}, 
            {wch: 10}, {wch: 10}, {wch: 10}, {wch: 12}, 
            {wch: 15}, {wch: 30}
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Inventario");
        XLSX.writeFile(wb, `Reporte_Inventario_${meta.b}_${meta.f}.xlsx`);

    } catch (e) { 
        console.error("Error detallado:", e);
        alert("Error al generar Excel. Revisa la consola (F12) para más detalles."); 
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
        
        const fM = (n) => new Intl.NumberFormat('es-CL', { 
            style: 'currency', currency: 'CLP', minimumFractionDigits: 2 
        }).format(n);
        
        // Cabecera completa
        doc.setFontSize(16);
        doc.text("Reporte de Inventario Físico", 148.5, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Bodega: ${meta.b} | Site: ${meta.s} | Fecha: ${meta.f} | Responsable: ${meta.r}`, 148.5, 22, { align: 'center' });
        
        const body = productosBase.map(p => {
            const f = parseFloat(localStorage.getItem(`inv-${p.codigo}-${p.lote}`)) || 0;
            const d = f - p.teorico;
            return [p.codigo, p.nombre, p.teorico.toFixed(2), f.toFixed(2), d.toFixed(2), fM(p.precio), fM(d * p.precio), fM(f * p.precio)];
        });

        doc.autoTable({
            startY: 28,
            head: [['Cód.', 'Producto', 'Sist.', 'Fís.', 'Dif.', 'Precio', 'Vr. Dif', 'Total Fís.']],
            body: body,
            styles: { fontSize: 7, halign: 'right' },
            columnStyles: { 0: {halign: 'left'}, 1: {halign: 'left'} },
            didParseCell: (data) => {
                // Colorear Diferencias (Col 4 y 6)
                if ([4, 6].includes(data.column.index)) {
                    const v = parseFloat(data.cell.raw.toString().replace(/[^0-9.-]/g, ''));
                    if (v < 0) data.cell.styles.textColor = [200, 0, 0];
                    else if (v > 0) data.cell.styles.textColor = [0, 128, 0];
                }
            }
        });

        const y = doc.lastAutoTable.finalY + 10;
        doc.setTextColor(0);
        // Totales sin decimales como pediste
        doc.text(`Total Sistema: ${new Intl.NumberFormat('es-CL', {style:'currency', currency:'CLP', maximumFractionDigits:0}).format(res.sistema)}`, 14, y);
        doc.text(`Total Físico:   ${new Intl.NumberFormat('es-CL', {style:'currency', currency:'CLP', maximumFractionDigits:0}).format(res.fisico)}`, 14, y + 7);
        
        // Diferencia y Porcentaje con color
        const color = res.difPesos < 0 ? [200, 0, 0] : [0, 128, 0];
        doc.setTextColor(color[0], color[1], color[2]);
        doc.setFont(undefined, 'bold');
        doc.text(`DIFERENCIA: ${fM(res.difPesos)}  (${res.porcentaje}%)`, 14, y + 14);
        
        doc.save(`Reporte_${meta.b}.pdf`);
    } catch (e) { alert("Error al generar PDF."); }
}

function formatearMoneda(v) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);
}

function actualizarBarraProgreso() {
    const total = productosBase.length;
    if (total === 0) return;

    // Contamos cuántos productos tienen un valor físico ingresado en la memoria
    const contados = productosBase.filter(p => {
        const valor = localStorage.getItem(`inv-${p.codigo}-${p.lote}`);
        return valor !== null && valor !== ""; 
    }).length;

    const porc = Math.round((contados / total) * 100);
    const bar = document.getElementById('progress-bar');
    
    if (bar) {
        bar.style.width = porc + "%"; 
        bar.innerText = porc + "%";   
        
        // Color dinámico: Naranja si está en proceso, Verde si está al 100%
        if (porc < 100) {
            bar.style.backgroundColor = "#f39c12"; 
        } else {
            bar.style.backgroundColor = "#27ae60"; 
        }
    }
}

function filtrarProductos() {
    const t = document.getElementById('search').value.toLowerCase();
    const filtrados = productosBase.filter(p => 
        p.nombre.toLowerCase().includes(t) || 
        p.codigo.toLowerCase().includes(t) || 
        p.lote.toLowerCase().includes(t)
    );
    renderizarTarjetas(filtrados);
}

function limpiarTodo() {
    if(confirm("¿Seguro que quieres borrar todo el conteo actual?")) {
        // Borramos solo los datos del inventario, no la configuración (meta)
        productosBase.forEach(p => {
            localStorage.removeItem(`inv-${p.codigo}-${p.lote}`);
        });
        location.reload();
    }
}

function toggleDarkMode() {
    const body = document.body;
    const btn = document.getElementById('dark-mode-btn');
    
    body.classList.toggle('dark-mode');
    
    if (body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
        btn.innerText = "☀️ Light";
    } else {
        localStorage.setItem('theme', 'light');
        btn.innerText = "🌙 Dark";
    }
}

// Al cargar la página, revisar si ya estaba en modo oscuro
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode-btn').innerText = "☀️ Light";
    }
});

function capturarNuevoBarcode(codigoProducto) {
    const nuevoBC = prompt("Escanee o escriba el nuevo código de barra para el ID: " + codigoProducto);
    if (nuevoBC) {
        let lista = JSON.parse(localStorage.getItem(`barcodes-${codigoProducto}`)) || [];
        if (!lista.includes(nuevoBC)) {
            lista.push(nuevoBC);
            localStorage.setItem(`barcodes-${codigoProducto}`, JSON.stringify(lista));
            // Refrescamos la lista para que se vea el nuevo código inmediatamente
            filtrarProductos(); 
        } else {
            alert("Este código ya existe para este producto.");
        }
    }
}

function abrirEscaner(codigoProducto) {
    alert("Función de cámara en desarrollo. Por ahora, use el botón + BarCode para ingresar manualmente.");
}

// Detectar tecla Enter en los inputs de cantidad
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
        const index = inputs.indexOf(document.activeElement);
        if (index > -1 && index < inputs.length - 1) {
            inputs[index + 1].focus(); // Salta al siguiente input
            inputs[index + 1].select(); // Selecciona el texto para borrarlo rápido
        }
    }
});

let productoActualParaScan = null;

function abrirEscaner(codigoProducto) {
    productoActualParaScan = codigoProducto;
    document.getElementById('camera-scanner').style.display = 'block';
    
    Quagga.init({
        inputStream: { name: "Live", type: "LiveStream", target: document.querySelector('#interactive') },
        decoder: { readers: ["ean_reader", "code_128_reader", "upc_reader"] }
    }, function(err) {
        if (err) { alert("Error al abrir cámara"); return; }
        Quagga.start();
    });
}

// Variable para evitar que el escáner registre 10 veces el mismo código en un segundo
let lastScannedCode = "";
let lastScannedTime = 0;

Quagga.onDetected(function(result) {
    const codigoLeido = result.codeResult.code;
    const ahora = Date.now();

    // Evitar lecturas duplicadas accidentales (espera 1.5 segundos entre lecturas del mismo código)
    if (codigoLeido === lastScannedCode && (ahora - lastScannedTime) < 1500) return;

    const barcodesRegistrados = JSON.parse(localStorage.getItem(`barcodes-${productoActualParaScan}`)) || [];
    
    if (barcodesRegistrados.includes(codigoLeido)) {
        lastScannedCode = codigoLeido;
        lastScannedTime = ahora;

        // Vibración corta para confirmar (solo funciona en Android/Chrome)
        if (navigator.vibrate) navigator.vibrate(100);

        // SUMA AUTOMÁTICA +1
        sumarUnoAlConteo(productoActualParaScan);
    }
});
function sumarUnoAlConteo(idProducto) {
    const p = productosBase.find(prod => prod.codigo === idProducto);
    if (p) {
        const key = `inv-${p.codigo}-${p.lote}`;
        const actual = parseFloat(localStorage.getItem(key)) || 0;
        const nuevaCantidad = actual + 1;
        
        localStorage.setItem(key, nuevaCantidad);

        // BUSCAMOS EL CUADRO "FÍSICO" POR SU ETIQUETA data-key
        const inputFisico = document.querySelector(`input[data-key="${key}"]`);
        
        if (inputFisico) {
            inputFisico.value = nuevaCantidad; // Aquí es donde cambia el número en pantalla
            actualizarConteo(inputFisico, p.teorico, p.precio, key); // Esto actualiza colores y totales
        }
        
        mostrarAvisoRapido(`+1 (Total: ${nuevaCantidad})`);
    }
}
function mostrarAvisoRapido(msj) {
    const aviso = document.createElement("div");
    aviso.style = "position:fixed; top:20%; left:50%; transform:translate(-50%, -50%); background:rgba(39, 174, 96, 0.9); color:white; padding:15px 30px; border-radius:50px; z-index:10000; font-weight:bold; font-size:1.5em;";
    aviso.innerText = msj;
    document.body.appendChild(aviso);
    setTimeout(() => aviso.remove(), 1000);
}

function cerrarEscaner() {
    Quagga.stop();
    document.getElementById('camera-scanner').style.display = 'none';
}