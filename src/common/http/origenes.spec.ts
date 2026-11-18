import {
  normalizarOrigen,
  origenPermitido,
  origenesPermitidos,
  permitirOrigenSocket,
} from './origenes';

describe('orígenes permitidos', () => {
  it('normaliza espacios y barra final', () => {
    expect(normalizarOrigen(' https://dizelf.dev/ ')).toBe(
      'https://dizelf.dev',
    );
  });

  it('separa por comas, normaliza y deduplica', () => {
    expect(
      origenesPermitidos('https://a.dev/, https://b.dev,https://a.dev'),
    ).toEqual(['https://a.dev', 'https://b.dev']);
  });

  it('usa localhost:3000 cuando no hay FRONTEND_URL', () => {
    expect(origenesPermitidos(undefined)).toEqual(['http://localhost:3000']);
    expect(origenesPermitidos('')).toEqual(['http://localhost:3000']);
  });

  it('permite un origen de la lista con o sin barra final', () => {
    const permitidos = ['https://dizelf.dev'];

    expect(origenPermitido('https://dizelf.dev', permitidos)).toBe(true);
    expect(origenPermitido('https://dizelf.dev/', permitidos)).toBe(true);
  });

  it('rechaza un origen ajeno', () => {
    expect(origenPermitido('https://evil.dev', ['https://dizelf.dev'])).toBe(
      false,
    );
  });

  it('permite clientes sin Origin (curl, app nativa)', () => {
    expect(origenPermitido(undefined, [])).toBe(true);
  });

  it('el adaptador de socket.io acepta y rechaza', () => {
    const anterior = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'http://localhost:3000';

    try {
      const aceptar = jest.fn();
      const rechazar = jest.fn();

      permitirOrigenSocket('http://localhost:3000', aceptar);
      // Sin Origin siempre pasa: curl, health checks y apps nativas.
      permitirOrigenSocket(undefined, rechazar);

      expect(aceptar).toHaveBeenCalledWith(null, true);
      expect(rechazar).toHaveBeenCalledWith(null, true);
    } finally {
      if (anterior === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = anterior;
    }
  });

  it('el adaptador de socket.io devuelve error con un origen ajeno', () => {
    const callback = jest.fn();

    permitirOrigenSocket('https://evil.dev', callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error), false);
  });
});
