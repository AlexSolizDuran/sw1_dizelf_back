import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  TICKET_SCOPE,
  TokenVerificadorService,
} from './token-verificador.service';

/**
 * El ticket de sync es la pieza que reemplaza a la cookie en el handshake del
 * WebSocket: el HTTP va por el proxy del front (la cookie queda host-only de
 * Vercel), y el socket sigue yendo directo a Render. Si esto se rompe, el
 * síntoma es "Sesión no válida" al abrir cualquier proyecto, sin ningún error
 * previo en consola.
 *
 * `@nestjs/jwt` y `@nestjs/config` se mockean porque sus dist son ESM y Jest
 * corre en CommonJS (mismo motivo que en `auth.service.spec.ts`). El mock de
 * `JwtService` guarda el payload junto al secreto con el que se firmó y expira
 * según `expiresIn`: alcanza para verificar lo que importa acá —qué secreto usa
 * cada camino y qué claims exige la verificación—.
 */

jest.mock('@nestjs/jwt', () => {
  interface Firmado {
    payload: Record<string, unknown>;
    expiraEn: number | null;
    secreto: string;
  }

  class MockJwtService {
    private readonly emitidos = new Map<string, Firmado>();

    signAsync(
      payload: Record<string, unknown>,
      opciones: { secret?: string; expiresIn?: number | string } = {},
    ): Promise<string> {
      const token = `token-${this.emitidos.size + 1}`;
      this.emitidos.set(token, {
        payload,
        expiraEn:
          typeof opciones.expiresIn === 'number'
            ? Date.now() + opciones.expiresIn * 1000
            : null,
        secreto: opciones.secret ?? '',
      });
      return Promise.resolve(token);
    }

    verifyAsync<T>(
      token: string,
      opciones: { secret?: string } = {},
    ): Promise<T> {
      const firmado = this.emitidos.get(token);
      if (!firmado) throw new Error('invalid signature');
      if (firmado.secreto !== (opciones.secret ?? '')) {
        throw new Error('invalid signature');
      }
      if (firmado.expiraEn !== null && firmado.expiraEn <= Date.now()) {
        throw new Error('jwt expired');
      }
      return Promise.resolve(firmado.payload as T);
    }
  }

  return { JwtService: MockJwtService };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {},
}));

const SECRETO = 'secreto-de-pruebas-para-jwt-con-32-chars';
const PROYECTO = '11111111-1111-4111-8111-111111111111';
const OTRO_PROYECTO = '22222222-2222-4222-8222-222222222222';

const crearServicio = (): {
  servicio: TokenVerificadorService;
  jwt: JwtService;
} => {
  const jwt = new JwtService({});
  const config = {
    get: (clave: string) => (clave === 'app.jwtSecret' ? SECRETO : undefined),
  } as unknown as ConfigService;

  return { servicio: new TokenVerificadorService(jwt, config), jwt };
};

describe('TokenVerificadorService — ticket de sync', () => {
  it('acepta un ticket emitido para el mismo usuario y proyecto', async () => {
    const { servicio } = crearServicio();

    const ticket = await servicio.firmarTicket(7, PROYECTO);

    await expect(servicio.verificarTicket(ticket, PROYECTO)).resolves.toEqual({
      sub: 7,
    });
  });

  it('firma con un secreto derivado, no con el de sesión', async () => {
    const { servicio, jwt } = crearServicio();
    const espia = jest.spyOn(jwt, 'signAsync');

    await servicio.firmarTicket(7, PROYECTO);

    expect(espia).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 7,
        proyectoId: PROYECTO,
        scope: TICKET_SCOPE,
      }),
      expect.objectContaining({ secret: `${SECRETO}:sync-ticket` }),
    );
  });

  it('rechaza el ticket de un proyecto usado en otro', async () => {
    const { servicio } = crearServicio();

    // Sin esta comprobación, un ticket legítimo de un proyecto propio abriría
    // el socket de cualquier otro con solo cambiar el `query`.
    const ticket = await servicio.firmarTicket(7, PROYECTO);

    await expect(
      servicio.verificarTicket(ticket, OTRO_PROYECTO),
    ).resolves.toBeNull();
  });

  it('rechaza un ticket vencido', async () => {
    const { servicio, jwt } = crearServicio();
    const vencido = await jwt.signAsync(
      { sub: 7, proyectoId: PROYECTO, scope: TICKET_SCOPE },
      { secret: `${SECRETO}:sync-ticket`, expiresIn: -10 },
    );

    await expect(
      servicio.verificarTicket(vencido, PROYECTO),
    ).resolves.toBeNull();
  });

  it('rechaza un token de sesión usado como ticket', async () => {
    const { servicio, jwt } = crearServicio();
    // Firma con el secreto de sesión, no con el derivado.
    const tokenDeSesion = await jwt.signAsync(
      { sub: 7, username: 'alex' },
      { secret: SECRETO, expiresIn: '1d' },
    );

    await expect(
      servicio.verificarTicket(tokenDeSesion, PROYECTO),
    ).resolves.toBeNull();
  });

  it('rechaza un ticket firmado con el secreto derivado pero sin alcance', async () => {
    const { servicio, jwt } = crearServicio();
    const sinAlcance = await jwt.signAsync(
      { sub: 7, proyectoId: PROYECTO },
      { secret: `${SECRETO}:sync-ticket`, expiresIn: 120 },
    );

    await expect(
      servicio.verificarTicket(sinAlcance, PROYECTO),
    ).resolves.toBeNull();
  });

  it('devuelve null cuando no hay ticket', async () => {
    const { servicio } = crearServicio();
    await expect(
      servicio.verificarTicket(undefined, PROYECTO),
    ).resolves.toBeNull();
  });
});

describe('TokenVerificadorService — leerTicket', () => {
  it('lee `handshake.auth.ticket` y tolera basura del cliente', () => {
    const { servicio } = crearServicio();

    expect(servicio.leerTicket({ ticket: 'abc' })).toBe('abc');
    expect(servicio.leerTicket({})).toBeUndefined();
    expect(servicio.leerTicket(null)).toBeUndefined();
    expect(servicio.leerTicket('abc')).toBeUndefined();
    expect(servicio.leerTicket({ ticket: 123 })).toBeUndefined();
    expect(servicio.leerTicket({ ticket: '' })).toBeUndefined();
  });
});
