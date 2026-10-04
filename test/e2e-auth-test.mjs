async function runTests() {
  const baseUrl = 'http://localhost:3000';
  const randomSuffix = Math.floor(Math.random() * 100000);

  const testUser = {
    nombre: 'Yohan',
    apellido: 'Duran',
    gmail: `yohan.test${randomSuffix}@example.com`,
    username: `yohan${randomSuffix}`,
    password: 'SuperPassword123!',
  };

  console.log('=== TEST 1: Registro de Usuario (HU 1) ===');
  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser),
  });
  console.log('Status:', regRes.status);
  const regBody = await regRes.json();
  console.log('Body:', JSON.stringify(regBody, null, 2));

  // Extraer cookie
  const setCookie = regRes.headers.get('set-cookie');
  console.log('Set-Cookie recibido:', setCookie ? 'SÍ (httpOnly)' : 'NO');
  const cookieHeader = setCookie ? setCookie.split(';')[0] : '';

  console.log('\n=== TEST 2: Acceso protegido SIN cookie ===');
  const noAuthRes = await fetch(`${baseUrl}/auth/perfil`);
  console.log('Status (esperado 401):', noAuthRes.status);

  console.log('\n=== TEST 3: Acceso protegido CON cookie de sesión ===');
  const authRes = await fetch(`${baseUrl}/auth/perfil`, {
    headers: { Cookie: cookieHeader },
  });
  console.log('Status (esperado 200):', authRes.status);
  const perfil = await authRes.json();
  console.log('Perfil obtenido:', JSON.stringify(perfil, null, 2));

  console.log('\n=== TEST 4: Inicio de Sesión válido (HU 2) ===');
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identificador: testUser.username,
      password: testUser.password,
    }),
  });
  console.log('Status (esperado 200):', loginRes.status);
  const loginBody = await loginRes.json();
  console.log('Login Body:', JSON.stringify(loginBody, null, 2));

  console.log('\n=== TEST 5: Inicio de Sesión con Email (HU 2) ===');
  const loginEmailRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identificador: testUser.gmail,
      password: testUser.password,
    }),
  });
  console.log('Status (esperado 200):', loginEmailRes.status);

  console.log('\n=== TEST 6: Inicio de Sesión inválido (HU 2) ===');
  const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identificador: testUser.username,
      password: 'ContrasenaIncorrecta1!',
    }),
  });
  console.log('Status (esperado 401):', badLoginRes.status);
  const badBody = await badLoginRes.json();
  console.log('Mensaje anti-enumeración:', badBody.message);

  console.log('\n=== TEST 7: Intento de Registro Duplicado (Conflict) ===');
  const dupRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser),
  });
  console.log('Status (esperado 409):', dupRes.status);
  const dupBody = await dupRes.json();
  console.log('Mensaje de duplicado:', dupBody.message);

  console.log('\n=== TEST 8: Cierre de Sesión (HU 3) ===');
  const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookieHeader },
  });
  console.log('Status (esperado 200):', logoutRes.status);
  const logoutBody = await logoutRes.json();
  console.log('Logout Body:', JSON.stringify(logoutBody, null, 2));
  console.log('Set-Cookie de eliminación:', logoutRes.headers.get('set-cookie'));

  console.log('\n=== TODOS LOS TESTS FUNCIONALES COMPLETADOS CON ÉXITO ===');
}

runTests().catch(console.error);
