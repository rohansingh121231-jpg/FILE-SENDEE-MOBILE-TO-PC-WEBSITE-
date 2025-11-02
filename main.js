const statusEl = document.getElementById('status');
const qrCodeContainer = document.getElementById('qr-code-container');
const qrEl = document.getElementById('qrcode');
const scanInstructions = document.getElementById('scan-instructions');
const fileInput = document.getElementById('file-input');
const transferStatusEl = document.getElementById('transfer-status');

let peer = null;
let currentConnection = null;
let myId = '';

const CHUNK_SIZE = 64 * 1024; // 64KB

function initializePeer() {
    peer = new Peer(); 

    peer.on('open', (id) => {
        myId = id;
        statusEl.textContent = 'Your device is ready.';
        
        const targetId = window.location.hash.substring(1);

        if (targetId) {
            qrCodeContainer.style.display = 'none';
            scanInstructions.style.display = 'block';
            statusEl.textContent = 'Connecting...';
            const conn = peer.connect(targetId, { reliable: true });
            setupConnection(conn);
        } else {
            const connectUrl = `${window.location.origin}${window.location.pathname}#${myId}`;
            new QRCode(qrEl, {
                text: connectUrl,
                width: 256,
                height: 256,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
            statusEl.textContent = 'Ready to connect.';
        }
    });

    peer.on('connection', (conn) => {
        console.log('Incoming connection from', conn.peer);
        if (currentConnection) {
            conn.close();
            return;
        }
        statusEl.textContent = 'Device connected!';
        setupConnection(conn);
        qrCodeContainer.style.display = 'none';
        scanInstructions.style.display = 'block';
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        statusEl.textContent = `Error: ${err.message}. Try refreshing.`;
    });
}

function setupConnection(conn) {
    currentConnection = conn;

    conn.on('open', () => {
        console.log('Connection established with', conn.peer);
        statusEl.textContent = `Connected to ${conn.peer.substring(0, 6)}...`;
        fileInput.disabled = false;
        transferStatusEl.textContent = 'Select a file to send.';
        qrCodeContainer.style.display = 'none';
        scanInstructions.style.display = 'block';
    });

    let incomingFileData = [];
    let fileMetadata = {};

    conn.on('data', (data) => {
        if (data.type === 'metadata') {
            fileMetadata = data;
            incomingFileData = [];
            console.log('Receiving metadata:', fileMetadata);
            transferStatusEl.textContent = `Receiving: ${fileMetadata.name}`;
        } else if (data.type === 'end') {
            console.log('File transfer complete.');
            const fileBlob = new Blob(incomingFileData, { type: fileMetadata.type });
            const downloadUrl = URL.createObjectURL(fileBlob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileMetadata.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            transferStatusEl.textContent = `File ${fileMetadata.name} received!`;
        } else {
            incomingFileData.push(data);
        }
    });

    conn.on('close', () => {
        console.log('Connection closed');
        statusEl.textContent = 'Device disconnected. Refresh page.';
        transferStatusEl.textContent = 'Connect to a device to send files.';
        fileInput.disabled = true;
        currentConnection = null;
        qrCodeContainer.style.display = 'block';
        qrEl.innerHTML = '';
        statusEl.textContent = 'Disconnected. Refresh to get a new code.';
    });
}

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file || !currentConnection) return;

    console.log('Sending file:', file.name);
    transferStatusEl.textContent = `Sending ${file.name}...`;

    currentConnection.send({
        type: 'metadata',
        name: file.name,
        size: file.size,
        fileType: file.type
    });

    let offset = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
        currentConnection.send(e.target.result);
        offset += e.target.result.byteLength;

        if (offset < file.size) {
            readSlice(offset);
        } else {
            currentConnection.send({ type: 'end' });
            console.log('File sent successfully.');
            transferStatusEl.textContent = `File ${file.name} sent!`;
        }
    };

    function readSlice(o) {
        const slice = file.slice(o, o + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
    }
    readSlice(0);
});

initializePeer();
