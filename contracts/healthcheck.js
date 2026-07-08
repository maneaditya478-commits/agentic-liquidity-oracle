const http = require('http');

const data = JSON.stringify({
  jsonrpc: "2.0",
  method: "eth_blockNumber",
  params: [],
  id: 1
});

const options = {
  hostname: '127.0.0.1',
  port: 8545,
  path: '/',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  },
  timeout: 2000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    console.error(`Healthcheck failed with status: ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (err) => {
  console.error(`Healthcheck request error: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('Healthcheck request timed out');
  req.destroy();
  process.exit(1);
});

req.write(data);
req.end();
