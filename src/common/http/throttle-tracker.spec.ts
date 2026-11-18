import { claveDeRastreo, LARGO_MAXIMO_EMAIL } from './throttle-tracker';

describe('claveDeRastreo', () => {
  it('prioriza el usuario autenticado sobre el email y la IP', () => {
    expect(
      claveDeRastreo({
        ip: '10.0.0.1',
        user: { sub: 42 },
        body: { email: 'ana@ejemplo.com' },
      }),
    ).toBe('usuario:42');
  });

  it('normaliza el email para que mayúsculas y espacios cuenten juntos', () => {
    expect(claveDeRastreo({ body: { email: '  Ana@Ejemplo.COM ' } })).toBe(
      'email:ana@ejemplo.com',
    );
  });

  it('trunca emails largos para no acumular claves enormes', () => {
    const clave = claveDeRastreo({
      body: { email: `${'a'.repeat(500)}@ejemplo.com` },
    });

    expect(clave).toBe(`email:${'a'.repeat(LARGO_MAXIMO_EMAIL)}`);
  });

  it('cae a la IP cuando no hay sesión ni email válido', () => {
    expect(claveDeRastreo({ ip: '200.87.1.10' })).toBe('ip:200.87.1.10');
    expect(claveDeRastreo({ ip: '200.87.1.10', body: { email: 123 } })).toBe(
      'ip:200.87.1.10',
    );
    expect(claveDeRastreo({ body: { email: '   ' }, ip: '1.2.3.4' })).toBe(
      'ip:1.2.3.4',
    );
  });

  it('no rompe si falta la IP', () => {
    expect(claveDeRastreo({})).toBe('ip:desconocida');
  });
});
