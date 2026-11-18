import { envValidationSchema } from './env.validation';

const base = {
  NEON_DB_URL: 'postgresql://usuario:clave@host-pooler/db',
  NEON_DIRECT_URL: 'postgresql://usuario:clave@host/db',
  JWT_SECRET: 'x'.repeat(32),
};

const validar = (cambios: Record<string, unknown> = {}) =>
  envValidationSchema.validate(
    { ...base, ...cambios },
    { abortEarly: false, allowUnknown: true },
  );

describe('envValidationSchema', () => {
  it('acepta la configuración mínima y aplica defaults', () => {
    const resultado = validar();

    expect(resultado.error).toBeUndefined();
    expect(resultado.value).toMatchObject({
      PUSH_ENABLED: false,
      PUSH_TIMEOUT_MS: 4000,
      PUSH_THROTTLE_SEGUNDOS: 60,
      JWT_EXPIRACION: '1d',
    });
  });

  it('exige NEON_DIRECT_URL para las migraciones', () => {
    const { error } = envValidationSchema.validate(
      { NEON_DB_URL: base.NEON_DB_URL, JWT_SECRET: base.JWT_SECRET },
      { abortEarly: false },
    );

    expect(error?.message).toContain('NEON_DIRECT_URL');
  });

  it('rechaza un JWT_SECRET de menos de 32 caracteres', () => {
    const { error } = validar({ JWT_SECRET: 'x'.repeat(31) });

    expect(error?.message).toContain('al menos 32 caracteres');
  });

  it('parsea las variables de push', () => {
    const resultado = validar({
      PUSH_ENABLED: 'true',
      EXPO_ACCESS_TOKEN: 'token',
      PUSH_TIMEOUT_MS: '2500',
      PUSH_THROTTLE_SEGUNDOS: '0',
    });

    expect(resultado.error).toBeUndefined();
    expect(resultado.value).toMatchObject({
      PUSH_ENABLED: true,
      EXPO_ACCESS_TOKEN: 'token',
      PUSH_TIMEOUT_MS: 2500,
      PUSH_THROTTLE_SEGUNDOS: 0,
    });
  });
});
