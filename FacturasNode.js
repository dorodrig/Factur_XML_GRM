const express = require('express');
const https = require('https');
const querystring = require('querystring');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const bodyParser = require('body-parser');
const csv = require('csv-writer').createObjectCsvWriter;
const AdmZip = require('adm-zip');
const { Parser } = require('xml2js');
const multer = require('multer');
const { tokenaccees, tokensecret } = require('./token.js');

let facturasProcesadas = [];
const app = express();
// Configurar el middleware multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Define el directorio donde se almacenarán temporalmente los archivos subidos
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Conservar el nombre original del archivo
    },
});
const upload = multer({ storage }); // Define el directorio donde se almacenarán temporalmente los archivos subidos
app.use(upload.array('files')); // 'files' debe coincidir con el name del input en el formulario HTML

//const port = 5501;

const environment = 'BASE DE VV';

app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});

app.use(bodyParser.urlencoded({ extended: true }));
// Ruta para mostrar el formulario de selección de carpeta
app.get('/', (req, res) => {
    const html = `
    <html>
    <head>
     <meta charset="UTF-8" />
     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
     <title>GRM Factura</title>
    <link rel="stylesheet" href="/style.css" />
     </head>
        <body>        
        <h1>Procesar Archivos XML GRM</h1>
            <div id ="container">      
            <form action="/procesarArchivos" method="post" enctype="multipart/form-data">
                <label id="texto" for="directory">Seleccione la carpeta:</label>
                <input type="file" id="directory_in" name="files" multiple required><br>
                <button id="btn_process" type="submit">Procesar Archivos XML</button>            
            </form>
            <img id="imagen" src="https://www.grmdocumentmanagement.com/static/bb0082f72ec6d7984f59880fa4eefdb7/Grm-logo-optimized.png" alt="logo" width="300" />
        </div>    
        </body>
    </html>
`;
    res.send(html);
});

// Ruta para procesar los archivos XML en la carpeta seleccionada
app.post('/procesarArchivos', async (req, res) => {
    const files = req.files; // Obtener la ruta del directorio desde el cuerpo de la solicitud
    if (!files || !Array.isArray(files) || files.length === 0) {
        res.status(400).send('No files selected');
        return;
    }
    const directoryPath = 'uploads/';
    facturasProcesadas = [];
    try {
        for (const file of files) {
            let factura = await processXMLs(directoryPath, file.originalname);
            if (factura) {
                facturasProcesadas.push(factura); // Agregar la factura procesada al arreglo
            }
        }
        const message = 'Archivos XML procesados y autenticados por API. Consulte el archivo CSV para ver los datos.';
        res.redirect(`/success?message=${encodeURIComponent(message)}&facturas=${encodeURIComponent(JSON.stringify(facturasProcesadas))}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while processing XML files.');
    }

});
// Iniciar el servidor  
app.listen(process.env.PORT || 3000);
console.log('Servidor iniciado en el puerto', process.env.PORT || 3000);
// Obtener el token de autenticación para acceder a la API externa
async function getAuthToken() {
    
    const userName = "tokenaccees";
    const password = "tokensecret";

    const postData = querystring.stringify({
        username: userName,
        password: password,
        grant_type: 'password'
    });
    //console.log(postData);
    const options = {
        hostname: environment + '.visualvault.com',
        path: '/oauth/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Host': environment + '.visualvault.com',
            'Authorization': 'Basic ' + Buffer.from(userName + ':' + password).toString('base64')
        }
    };
    // console.log(options);
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                const response = JSON.parse(data);
                const token = response.access_token;
                //console.log(token);
                resolve(token);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}
//console.log(getAuthToken());
// Crear un formulario en la API externa con los datos proporcionados
async function createForm(token, fact, val, val1, nit, fechac, descr, fileName) {
    const postData = JSON.stringify({
        'txt_idfactura': fact,
        'txt_numerodocumento': fact,
        'txt_numvalorf': val,
        'txt_facturavalor': val1,
        'Nit proveedor': nit,
        'Fecha del documento': fechac,
        'Observaciones': descr,
        'ddl_tipo de documetno': 'Factura',
        'Tipo de radicación': 'Electrónica',
        'Estado General': 'cargue realizado'
    });
    //base sa1    
    //RAMA DEV_DEMO Parachuagon SA1
    const customeralias = 'nombre cliente';
    const databasealias = 'nombre base';
    const formTemplateId = 'templatedGUID';
 

    const options = {
        hostname: environment + '.visualvault.com',
        path: `/api/v1/${customeralias}/${databasealias}/formtemplates/${formTemplateId}/forms`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            console.log(data);
        });
    });

    req.on('error', (error) => {
        console.error(error);
    });

    req.write(postData);
    req.end();
}

function findDescriptionRecursive(obj) {
    for (const key in obj) {
        if (typeof obj[key] === 'object') {
            if (key === 'cbc:Description') {
                return obj[key];
            } else {
                const result = findDescriptionRecursive(obj[key]);
                if (result) {
                    return result;
                }
            }
        }
    }
    return null;
}
function extraerInformacionXML(parsedData) {
    let cbcPayableAmount = 0; // Declarar la variable cbcPayableAmount
    let cbcdesc;
    if (parsedData.AttachedDocument && Array.isArray(parsedData.AttachedDocument['cac:Attachment']) &&
        parsedData.AttachedDocument['cac:Attachment'].length > 0
    ) {
        // Obtener el primer elemento dentro del array 'cac:Attachment'
        const attachment = parsedData.AttachedDocument['cac:Attachment'][0];
        //console.log('Contenido de "cac:Attachment":', attachment);

        // Verificar si 'cac:ExternalReference' existe en el elemento 'cac:Attachment'
        if (
            attachment['cac:ExternalReference'] &&
            Array.isArray(attachment['cac:ExternalReference']) &&
            attachment['cac:ExternalReference'].length > 0 &&
            attachment['cac:ExternalReference'][0]['cbc:Description']
        ) {
            const description = attachment['cac:ExternalReference'][0]['cbc:Description'][0];
            const parser = new xml2js.Parser();
            let parsedDescription;

            parser.parseString(description, (err, result) => {
                if (err) {
                    console.error('Error parsing XML:', err);
                    return;
                }
                parsedDescription = result;
                //console.log('Contenido de "cbc:Description" como objeto JavaScript:', parsedDescription);

                // Verificar si 'cac:LegalMonetaryTotal' existe en el objeto 'parsedDescription'
                if (
                    parsedDescription['Invoice'] &&
                    parsedDescription['Invoice']['cac:LegalMonetaryTotal'] &&
                    Array.isArray(parsedDescription['Invoice']['cac:LegalMonetaryTotal']) &&
                    parsedDescription['Invoice']['cac:LegalMonetaryTotal'].length > 0 &&
                    parsedDescription['Invoice']['cac:LegalMonetaryTotal'][0]['cbc:PayableAmount']
                ) {
                    // Obtener el valor de 'cbc:PayableAmount'
                    cbcPayableAmount = parsedDescription['Invoice']['cac:LegalMonetaryTotal'][0]['cbc:PayableAmount'][0]._;
                    //console.log('Valor de "cbc:PayableAmount":', cbcPayableAmount);
                } else {
                    console.log('No se encontró el elemento "cbc:PayableAmount" dentro de "cac:LegalMonetaryTotal".');
                }
                // Verificar si 'cac:LegalMonetaryTotal' existe en el objeto 'parsedDescription'
                let cbcdesc1 = findDescriptionRecursive(parsedDescription);
                cbcdesc = cbcdesc1.join("")
                if (cbcdesc) {
                    //console.log('Valor de "cbcdesc":', cbcdesc);
                } else {
                    console.log('No se encontró el elemento "cbc:PayableAmount" dentro de "cbc:Description".');
                }
            });


        } else {
            console.log('No se encontró el elemento "cbc:ExternalReference" o "cbc:Description" dentro de "cac:Attachment".');
        }
    } else {
        console.log('No se encontró el elemento "cac:Attachment" o está vacío.');
    }
    let factura = parsedData['AttachedDocument']['cbc:ID'] && parsedData['AttachedDocument']['cbc:ID'][0] || '';
    let fecha = parsedData['AttachedDocument']['cbc:IssueDate'] && parsedData['AttachedDocument']['cbc:IssueDate'][0] || '';
    const valor = parseInt(cbcPayableAmount); // Convertir el valor a número, si es necesario
    const valor2 = valor.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
    let nit2 = parsedData['AttachedDocument']['cac:SenderParty'] && parsedData['AttachedDocument']['cac:SenderParty'][0]['cac:PartyTaxScheme'] && parsedData['AttachedDocument']['cac:SenderParty'][0]['cac:PartyTaxScheme'][0]['cbc:CompanyID'] && parsedData['AttachedDocument']['cac:SenderParty'][0]['cac:PartyTaxScheme'][0]['cbc:CompanyID'][0]['_'];
    let descripcion = cbcdesc || '';

    console.log('Factura:', factura);
    console.log('Fecha:', fecha);
    console.log('Valor:', valor);
    console.log('Descripción:', descripcion);
    console.log('Nit2:', nit2);

    return {
        factura,
        fecha,
        valor,
        valor2,
        descripcion,
        nit2,
    };
}

// Borrar el contenido de la carpeta temporal "uploads" después de procesar los archivos
function clearTempFolder(directoryPath) {
    try {
        const files = fs.readdirSync(directoryPath);
        for (const file of files) {
            const filePath = path.join(directoryPath, file);
            fs.unlinkSync(filePath); // Elimina cada archivo de la carpeta
        }
        console.log('Temporary folder cleared.');
    } catch (error) {
        console.error('Error clearing temporary folder:', error);
    }
}
app.get('/success', (req, res) => {
    app.get('/style.css', (req, res) => {
        res.sendFile(path.join(__dirname, 'style.css'));
    });
    const { message, facturas } = req.query;
    const facturasProcesadas = JSON.parse(facturas);
    const htmlsucces = `
        <html>
        <link rel="stylesheet" href="/style.css" />
            <body>
            <div id ="container2">
                <h3 id="proceso_completo">${message}</h3>
                <h4 id ="proceso_completo__title">Facturas procesadas correctamente:</h4>
                <ul>
                    ${facturasProcesadas.map((factura) => `<li>${factura}</li>`).join('')}
                </ul>
                <a href="tablero de informacion.com" target="_blank">
                    
                <button id="botonvisual">Ir a Visual Vault</button>
                </a>
                </div>   
            </body>
        </html>
    `;
    res.send(htmlsucces);
});


// Procesar los archivos XML
async function processXMLs(directoryPath) {
    // Obtener el token de autenticación
    const token = await getAuthToken();
    const facturasProcesadas = [];
    // Recorrer los archivos XML en el directorio
    const files = fs.readdirSync(directoryPath);
    console.log('Files ' + files);
    for (const file of files) {
        if (file.endsWith('.xml')) {

            const filePath = path.join(directoryPath, file);
            //console.log(filePath);
            // Leer el archivo XML
            const xmlData = fs.readFileSync(filePath, 'utf8');

            // Convertir el XML a un objeto JavaScript
            const parser = new xml2js.Parser();
            try {
                const parsedData = await parser.parseStringPromise(xmlData);
                //console.log(parsedData);
                // Extraer la información del objeto JavaScript
                const { factura, fecha, valor, valor2, descripcion, nit2 } = extraerInformacionXML(parsedData);

                // Crear el formulario en la API externa
                await createForm(token, factura, valor, valor2, nit2, fecha, descripcion, file);

                // Guardar los datos en un archivo CSV
                const dataRow = [factura, fecha, valor, valor2, nit2, descripcion, file];

                const csvRow = dataRow.join(',');
                fs.appendFileSync('datos.csv', csvRow + '\n', 'utf8');

                facturasProcesadas.push(factura); // Agregar la factura procesada al arreglo                
            } catch (error) {
                console.error('Error parsing XML:', error);
            }
            // Eliminar el archivo después de procesarlo
            fs.unlinkSync(filePath);
        } else {
            console.log(`Ignoring file "${file}" as it does not have a .xml extension.`);
        }
    }
    // Borrar el contenido de la carpeta temporal "uploads" después de procesar los archivos
    clearTempFolder(directoryPath);
    // Devolver el arreglo con las facturas procesadas
    return facturasProcesadas;
}