const http = require('http');

http.get('http://localhost:3000/api/health', (res) => {
  let data = '';
  res.on('data', () => { });
  res.on('end', () => {
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
}).on('error', () => {
  process.exit(1);
});
