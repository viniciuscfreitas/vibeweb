// Integration Tests - VibeWeb OS Backend
// Grug: "in-between tests" - test correctness of system, easy to see what break
// These are integration tests: test the API endpoints end-to-end
// No mocks - test against real database (use test database in production)
// Focus on critical flows: auth, CRUD operations, validation

const http = require('http');

const API_BASE_URL = 'http://localhost:3000';
let authToken = null;
let testTaskId = null;

// Test helper
async function request(method, endpoint, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Test functions
async function testLogin() {
  console.log('\n[TEST] Login...');
  const result = await request('POST', '/api/auth/login', {
    email: 'vinicius@example.com',
    password: 'admin123'
  });

  if (result.status === 200 && result.data.success && result.data.data.token) {
    authToken = result.data.data.token;
    console.log('✅ Login OK - Token recebido');
    return true;
  } else {
    console.log('❌ Login FAILED:', result);
    return false;
  }
}

async function testLoginInvalid() {
  console.log('\n[TEST] Login com credenciais inválidas...');
  const result = await request('POST', '/api/auth/login', {
    email: 'invalid@example.com',
    password: 'wrongpassword123'
  });

  // 401 = credenciais inválidas, 429 = rate limiting (também válido - segurança funcionando)
  if (result.status === 401 || result.status === 429) {
    console.log(`✅ Login inválido rejeitado corretamente (${result.status === 429 ? 'rate limited' : 'unauthorized'})`);
    return true;
  } else {
    console.log('❌ Login inválido não foi rejeitado:', result);
    return false;
  }
}

async function testGetMe() {
  console.log('\n[TEST] GET /api/auth/me...');
  const result = await request('GET', '/api/auth/me', null, authToken);

  if (result.status === 200 && result.data.success && result.data.data.user) {
    console.log('✅ Get current user OK');
    return true;
  } else {
    console.log('❌ Get current user FAILED:', result);
    return false;
  }
}

async function testGetTasks() {
  console.log('\n[TEST] GET /api/tasks...');
  const result = await request('GET', '/api/tasks', null, authToken);

  if (result.status === 200 && result.data.success && Array.isArray(result.data.data)) {
    console.log(`✅ Get tasks OK - ${result.data.data.length} tasks`);
    return true;
  } else {
    console.log('❌ Get tasks FAILED:', result);
    return false;
  }
}

async function testCreateTask() {
  console.log('\n[TEST] POST /api/tasks...');
  const taskData = {
    client: 'Test Client',
    contact: 'test@example.com',
    type: 'Landing Essencial',
    price: 1000,
    colId: 0,
    order: 0
  };

  const result = await request('POST', '/api/tasks', taskData, authToken);

  if (result.status === 201 && result.data.success && result.data.data.id) {
    testTaskId = result.data.data.id;
    console.log(`✅ Create task OK - ID: ${testTaskId}`);
    return true;
  } else {
    console.log('❌ Create task FAILED:', result);
    return false;
  }
}

async function testUpdateTask() {
  if (!testTaskId) {
    console.log('⚠️  Skip update test - no task ID');
    return false;
  }

  console.log('\n[TEST] PUT /api/tasks/:id...');
  const updateData = {
    client: 'Test Client Updated',
    price: 1500,
    colId: 1,
    order: 0
  };

  const result = await request('PUT', `/api/tasks/${testTaskId}`, updateData, authToken);

  if (result.status === 200 && result.data.success && result.data.data.client === 'Test Client Updated') {
    console.log('✅ Update task OK');
    return true;
  } else {
    console.log('❌ Update task FAILED:', result);
    return false;
  }
}

async function testMoveTask() {
  if (!testTaskId) {
    console.log('⚠️  Skip move test - no task ID');
    return false;
  }

  console.log('\n[TEST] PATCH /api/tasks/:id/move...');
  const result = await request('PATCH', `/api/tasks/${testTaskId}/move`, {
    colId: 2,
    order: 0
  }, authToken);

  if (result.status === 200 && result.data.success && result.data.data.col_id === 2) {
    console.log('✅ Move task OK');
    return true;
  } else {
    console.log('❌ Move task FAILED:', result);
    return false;
  }
}

async function testDeleteTask() {
  if (!testTaskId) {
    console.log('⚠️  Skip delete test - no task ID');
    return false;
  }

  console.log('\n[TEST] DELETE /api/tasks/:id...');
  const result = await request('DELETE', `/api/tasks/${testTaskId}`, null, authToken);

  if (result.status === 200 && result.data.success) {
    console.log('✅ Delete task OK');
    return true;
  } else {
    console.log('❌ Delete task FAILED:', result);
    return false;
  }
}

async function testUnauthorized() {
  console.log('\n[TEST] Request sem token...');
  const result = await request('GET', '/api/tasks');

  if (result.status === 401) {
    console.log('✅ Unauthorized request rejeitado corretamente');
    return true;
  } else {
    console.log('❌ Unauthorized request não foi rejeitado:', result);
    return false;
  }
}

async function testInvalidToken() {
  console.log('\n[TEST] Request com token inválido...');
  const result = await request('GET', '/api/tasks', null, 'invalid-token');

  if (result.status === 401) {
    console.log('✅ Token inválido rejeitado corretamente');
    return true;
  } else {
    console.log('❌ Token inválido não foi rejeitado:', result);
    return false;
  }
}

async function testValidation() {
  console.log('\n[TEST] Validação de input (client obrigatório)...');
  const result = await request('POST', '/api/tasks', {
    price: 1000,
    colId: 0,
    order: 0
    // client missing
  }, authToken);

  if (result.status === 400 && result.data.error && result.data.error.includes('cliente')) {
    console.log('✅ Validação de input OK');
    return true;
  } else {
    console.log('❌ Validação de input FAILED:', result);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('🧪 Iniciando testes de integração...\n');
  console.log('⚠️  Certifique-se de que o servidor está rodando em http://localhost:3000');
  console.log('⚠️  Execute: cd backend && npm start\n');

  const tests = [
    { name: 'Login válido', fn: testLogin },
    { name: 'Get current user', fn: testGetMe },
    { name: 'Get tasks', fn: testGetTasks },
    { name: 'Create task', fn: testCreateTask },
    { name: 'Update task', fn: testUpdateTask },
    { name: 'Move task', fn: testMoveTask },
    { name: 'Delete task', fn: testDeleteTask },
    { name: 'Unauthorized request', fn: testUnauthorized },
    { name: 'Invalid token', fn: testInvalidToken },
    { name: 'Input validation', fn: testValidation },
    { name: 'Login inválido', fn: testLoginInvalid } // Testado por último para não afetar rate limiting
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} ERROR:`, error.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Resultados: ${passed} passaram, ${failed} falharam`);
  console.log('='.repeat(50));

  if (failed === 0) {
    console.log('✅ Todos os testes passaram!');
    process.exit(0);
  } else {
    console.log('❌ Alguns testes falharam');
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    const result = await request('GET', '/api/auth/me');
    // Any response means server is running
    return true;
  } catch (error) {
    return false;
  }
}

// Main
(async () => {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.error('❌ Servidor não está rodando!');
    console.error('Execute: cd backend && npm start');
    process.exit(1);
  }

  await runTests();
})();
